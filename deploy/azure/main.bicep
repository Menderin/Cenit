targetScope = 'resourceGroup'

param location string = 'chilecentral'
param vmName string = 'cenit'
param vmSize string = 'Standard_B2als_v2'
param sshPublicKey string
param ubuntuVersion string
param adminUsername string = 'cenitadmin'

var tags = { project: 'cenit', expires: '2026-12-31' }

resource nsg 'Microsoft.Network/networkSecurityGroups@2024-05-01' = {
  name: '${vmName}-web'
  location: location
  tags: tags
  properties: {
    securityRules: [for port in [80, 443]: {
      name: 'web-${port}'
      properties: {
        priority: port == 80 ? 100 : 110
        protocol: 'Tcp'
        access: 'Allow'
        direction: 'Inbound'
        sourceAddressPrefix: '*'
        sourcePortRange: '*'
        destinationAddressPrefix: '*'
        destinationPortRange: string(port)
      }
    }]
  }
}
resource vnet 'Microsoft.Network/virtualNetworks@2024-05-01' = {
  name: '${vmName}-net'
  location: location
  tags: tags
  properties: {
    addressSpace: { addressPrefixes: ['10.42.0.0/16'] }
    subnets: [{ name: 'web', properties: { addressPrefix: '10.42.0.0/24', networkSecurityGroup: { id: nsg.id } } }]
  }
}
resource ip 'Microsoft.Network/publicIPAddresses@2024-05-01' = {
  name: '${vmName}-ip'
  location: location
  tags: tags
  sku: { name: 'Standard' }
  properties: { publicIPAllocationMethod: 'Static', publicIPAddressVersion: 'IPv4' }
}
resource nic 'Microsoft.Network/networkInterfaces@2024-05-01' = {
  name: '${vmName}-nic'
  location: location
  tags: tags
  properties: {
    ipConfigurations: [{
      name: 'web'
      properties: {
        privateIPAllocationMethod: 'Dynamic'
        subnet: { id: '${vnet.id}/subnets/web' }
        publicIPAddress: { id: ip.id }
      }
    }]
  }
}
resource vm 'Microsoft.Compute/virtualMachines@2024-11-01' = {
  name: vmName
  location: location
  tags: tags
  properties: {
    hardwareProfile: { vmSize: vmSize }
    storageProfile: {
      imageReference: { publisher: 'Canonical', offer: 'ubuntu-24_04-lts', sku: 'server', version: ubuntuVersion }
      osDisk: { createOption: 'FromImage', diskSizeGB: 64, managedDisk: { storageAccountType: 'StandardSSD_LRS' }, deleteOption: 'Detach' }
    }
    osProfile: {
      computerName: vmName
      adminUsername: adminUsername
      customData: base64(loadTextContent('cloud-init.yaml'))
      linuxConfiguration: {
        disablePasswordAuthentication: true
        provisionVMAgent: true
        ssh: { publicKeys: [{ path: '/home/${adminUsername}/.ssh/authorized_keys', keyData: sshPublicKey }] }
      }
    }
    securityProfile: { securityType: 'TrustedLaunch', uefiSettings: { secureBootEnabled: true, vTpmEnabled: true } }
    networkProfile: { networkInterfaces: [{ id: nic.id, properties: { deleteOption: 'Detach' } }] }
    diagnosticsProfile: { bootDiagnostics: { enabled: true } }
  }
}
resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${vmName}-github'
  location: location
  tags: tags
}
@batchSize(1)
resource federation 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = [for branch in ['main', 'develop']: {
  parent: identity
  name: branch
  properties: {
    issuer: 'https://token.actions.githubusercontent.com'
    subject: 'repo:Menderin@167567835/Cenit@1340887682:ref:refs/heads/${branch}'
    audiences: ['api://AzureADTokenExchange']
  }
}]
resource vmAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(vm.id, identity.id, 'deploy')
  scope: vm
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '9980e02c-c2be-4d73-94e8-173b1dc7cf3c')
  }
}
output publicIp string = ip.properties.ipAddress
output config object = {
  clientId: identity.properties.clientId
  tenantId: tenant().tenantId
  subscriptionId: subscription().subscriptionId
  resourceGroup: resourceGroup().name
  vmName: vm.name
  location: location
}
