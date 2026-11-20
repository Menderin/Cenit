#!/usr/bin/env bash
# Idempotent provisioning of the single Cenit EC2 node. Run by the AWS administrator, never from CI.
# Creates only what deploy/aws/README.md lists. Prints the Elastic IP.
set -Eeuo pipefail
cd "$(dirname "$0")/../.."
cfg() { python3 -c "import json;print(json.load(open('deploy/aws/config.json'))['$1'])"; }
region=$(cfg region); name=$(cfg instanceName); type=$(cfg instanceType); disk=$(cfg diskGb)
account=$(aws sts get-caller-identity --query Account --output text)
param="arn:aws:ssm:$region:$account:parameter/cenit/aws/ghcr-pull-token"
a() { aws --region "$region" "$@"; }

# 1. Instance profile: Systems Manager core plus read access to the GHCR token parameter only.
aws iam get-role --role-name cenit-ec2-node >/dev/null 2>&1 || aws iam create-role --role-name cenit-ec2-node \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
aws iam attach-role-policy --role-name cenit-ec2-node --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
aws iam put-role-policy --role-name cenit-ec2-node --policy-name ghcr-token-read --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"ssm:GetParameter\",\"Resource\":\"$param\"},{\"Effect\":\"Allow\",\"Action\":\"kms:Decrypt\",\"Resource\":\"*\",\"Condition\":{\"StringEquals\":{\"kms:ViaService\":\"ssm.$region.amazonaws.com\"}}}]}"
aws iam get-instance-profile --instance-profile-name cenit-ec2-node >/dev/null 2>&1 || {
  aws iam create-instance-profile --instance-profile-name cenit-ec2-node >/dev/null
  aws iam add-role-to-instance-profile --instance-profile-name cenit-ec2-node --role-name cenit-ec2-node; sleep 15; }

# 2. Security group: only TCP 80 and 443 inbound (no SSH).
vpc=$(a ec2 describe-vpcs --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text)
sg=$(a ec2 describe-security-groups --filters Name=group-name,Values=cenit-aws Name=vpc-id,Values="$vpc" --query 'SecurityGroups[0].GroupId' --output text)
if [[ $sg == None ]]; then
  sg=$(a ec2 create-security-group --group-name cenit-aws --description 'Cenit web ports' --vpc-id "$vpc" --query GroupId --output text)
  for port in 80 443; do a ec2 authorize-security-group-ingress --group-id "$sg" --protocol tcp --port $port --cidr 0.0.0.0/0 >/dev/null; done
fi

# 3. Instance (Ubuntu 24.04, encrypted gp3, IMDSv2 required), only if absent.
id=$(a ec2 describe-instances --filters Name=tag:Name,Values="$name" Name=instance-state-name,Values=pending,running,stopped --query 'Reservations[0].Instances[0].InstanceId' --output text)
if [[ $id == None ]]; then
  ami=$(a ssm get-parameter --name /aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id --query Parameter.Value --output text)
  id=$(a ec2 run-instances --image-id "$ami" --instance-type "$type" --iam-instance-profile Name=cenit-ec2-node \
    --security-group-ids "$sg" --user-data file://deploy/aws/cloud-init.yaml \
    --block-device-mappings "DeviceName=/dev/sda1,Ebs={VolumeSize=$disk,VolumeType=gp3,Encrypted=true,DeleteOnTermination=true}" \
    --metadata-options HttpTokens=required,HttpPutResponseHopLimit=2 \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$name},{Key=Cenit,Value=aws-node}]" "ResourceType=volume,Tags=[{Key=Name,Value=$name}]" \
    --query 'Instances[0].InstanceId' --output text)
fi
a ec2 wait instance-running --instance-ids "$id"

# 4. One Elastic IP attached to the node.
ip=$(a ec2 describe-addresses --filters Name=tag:Name,Values="$name" --query 'Addresses[0].AllocationId' --output text)
if [[ $ip == None ]]; then
  ip=$(a ec2 allocate-address --domain vpc --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=Name,Value=$name}]" --query AllocationId --output text)
fi
a ec2 associate-address --allocation-id "$ip" --instance-id "$id" >/dev/null
echo "instance=$id"
a ec2 describe-addresses --allocation-ids "$ip" --query 'Addresses[0].PublicIp' --output text
