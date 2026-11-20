#!/usr/bin/env bash
# Invoked by AWS Systems Manager Run Command on the single Cenit node. The GHCR read token is fetched
# from Parameter Store (SecureString) and never travels in the command text.
set -Eeuo pipefail
umask 077
[[ $EUID == 0 && $CENIT_ENV =~ ^(production|staging)$ ]]
exec 9>/run/lock/cenit-aws.lock
flock -w 600 9
cloud-init status --wait >/dev/null
root="/opt/cenit/$CENIT_ENV"
install -d -m 700 "$root" "$root/backups"
cd "$root"
dc() { docker compose --env-file .env -f compose.yaml "$@"; }
registry=$(mktemp -d /run/cenit-registry.XXXXXX)
activated=false
configured=false
caddy_configured=false
recover() {
  result=$?
  trap - EXIT
  rm -rf -- "$registry"
  if (( result != 0 )) && $caddy_configured; then
    cp "$BUNDLE_ROOT/previous.Caddyfile" /etc/caddy/Caddyfile
    systemctl reload caddy || echo 'Caddy recovery requires inspection.' >&2
  fi
  if (( result != 0 )) && $configured; then
    if [[ -f previous.env && -f previous.compose.yaml ]]; then
      cp previous.env .env
      cp previous.compose.yaml compose.yaml
      if $activated; then
        dc up -d --pull never --wait --wait-timeout 180 app || echo 'Recovery requires inspection.' >&2
      fi
    else
      dc stop app ocr || true
    fi
  fi
  exit "$result"
}
trap recover EXIT
# Each environment has an independent sequence; older queued runs cannot replace newer ones.
if [[ -f current.json ]]; then
  installed=$(python3 -c 'import json; print(json.load(open("current.json"))["runNumber"])')
  if (( installed > CENIT_RUN_NUMBER )); then
    echo 'A newer run is already installed; refusing this obsolete delivery.' >&2
    exit 1
  fi
  if (( installed == CENIT_RUN_NUMBER )); then
    python3 - <<'PY'
import json,os
current = json.load(open('current.json'))
assert current['image'] == os.environ['CENIT_APP_IMAGE'] and current['ocrImage'] == os.environ['CENIT_OCR_IMAGE'], 'This run was already installed with different digests; promote a new commit.'
PY
    echo 'The same run and image digests are already installed.'
    exit 0
  fi
fi
[[ $(df -Pk "$root" | awk 'NR==2 {print $4}') -ge 4194304 ]]
[[ ! -f migration-blocked ]] || { echo 'Inspect the previous interrupted/failed migration before retrying.' >&2; exit 1; }
registry_token=$(aws ssm get-parameter --region "$CENIT_AWS_REGION" --name "$CENIT_GHCR_PARAMETER" --with-decryption --query Parameter.Value --output text)
printf '%s' "$registry_token" | docker --config "$registry" login ghcr.io --username "$CENIT_ACTOR" --password-stdin >/dev/null
unset registry_token
docker --config "$registry" pull "$CENIT_APP_IMAGE"
docker --config "$registry" pull "$CENIT_OCR_IMAGE"
for image in "$CENIT_APP_IMAGE" "$CENIT_OCR_IMAGE"; do
  [[ $(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image") == "$CENIT_COMMIT" ]]
  [[ $(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.source"}}' "$image") == https://github.com/Menderin/Cenit ]]
done
if [[ -f .env && -f compose.yaml ]]; then
  cp .env previous.env
  cp compose.yaml previous.compose.yaml
fi
configured=true
install -d deploy/local deploy/scripts
install -m 644 "$BUNDLE_ROOT/compose.yaml" compose.yaml
install -m 644 "$BUNDLE_ROOT/init-db.sh" deploy/local/init-db.sh
install -m 644 "$BUNDLE_ROOT/setup-local.py" deploy/scripts/setup-local.py
touch .env.example
python3 deploy/scripts/setup-local.py
python3 - <<'PY'
from pathlib import Path
import secrets
key = Path('.local/secrets/capture-receipt-key')
if not key.exists():
    key.write_bytes(secrets.token_bytes(32))
    key.chmod(0o644)  # Host parent is 0700; container UID must read its mounted file.
PY
cat > .env <<EOF
CENIT_ENV=$CENIT_ENV
CENIT_APP_IMAGE=$CENIT_APP_IMAGE
CENIT_OCR_IMAGE=$CENIT_OCR_IMAGE
CENIT_ORIGIN=$CENIT_ORIGIN
CENIT_HTTP_PORT=$CENIT_HTTP_PORT
EOF
dc config --quiet
dc pull db
dc up -d --wait --wait-timeout 180 db
backup="backups/$CENIT_RUN_NUMBER-$(date -u +%Y%m%dT%H%M%SZ).dump"
dc exec -T db pg_dump -U cenit_admin -d cenit_demo -Fc > "$backup.partial"
dc exec -T db pg_restore --list < "$backup.partial" >/dev/null
mv "$backup.partial" "$backup"
# No seeds, no data restoration and no retry of a failed migration in this invocation.
touch migration-blocked
dc run --rm --no-deps migrate
rm migration-blocked
activated=true
dc up -d --pull never --wait --wait-timeout 180 app
curl --fail --silent "http://127.0.0.1:$CENIT_HTTP_PORT/health/ready" | python3 -c 'import json,sys; assert json.load(sys.stdin)=={"status":"ready"}'
curl --fail --silent "http://127.0.0.1:$CENIT_HTTP_PORT/login" -o /dev/null
# Both environments share one Caddyfile, so either delivery installs it.
caddy validate --config "$BUNDLE_ROOT/Caddyfile"
cp /etc/caddy/Caddyfile "$BUNDLE_ROOT/previous.Caddyfile"
caddy_configured=true
install -m 644 "$BUNDLE_ROOT/Caddyfile" /etc/caddy/Caddyfile
systemctl reload caddy
python3 - <<'PY'
import json,os
from pathlib import Path
data = {key: os.environ['CENIT_'+value] for key,value in [('commit','COMMIT'),('image','APP_IMAGE'),('ocrImage','OCR_IMAGE')]}
data['runNumber'] = int(os.environ['CENIT_RUN_NUMBER'])
Path('current.json.tmp').write_text(json.dumps(data)+'\n')
Path('current.json.tmp').replace('current.json')
PY
echo "Cenit $CENIT_ENV ready at $CENIT_ORIGIN; account/data preparation is separate."
