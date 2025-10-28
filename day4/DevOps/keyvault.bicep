param location string = resourceGroup().location
param projectName string
param stage string
param tags object
param managedIdPrincipalId string

var abbrs = loadJsonContent('abbreviations.json')
var roles = loadJsonContent('azure-roles.json')

@description('The principal ID of the Azure AD user or group to be added as a secret officer.')
param adminPrincipalId string

resource keyvault 'Microsoft.KeyVault/vaults@2022-07-01' = {
  name: '${abbrs.keyVaultVaults}${uniqueString(projectName, stage)}'
  location: location
  tags: tags
  properties: {
    // Change the following settings as needed
    enabledForDeployment: false
    enabledForDiskEncryption: false
    enabledForTemplateDeployment: false
    enableRbacAuthorization: true
    enableSoftDelete: false
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    publicNetworkAccess: 'Enabled'
  }
}

resource appKeyVaultAssignment 'Microsoft.Authorization/roleAssignments@2020-04-01-preview' = {
  name: guid(keyvault.id, managedIdPrincipalId)
  scope: keyvault
  properties: {
    principalId: managedIdPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: resourceId('Microsoft.Authorization/roleDefinitions', roles.KeyVaultSecretsUser)
  }
}

resource adminKeyVaultAssignment 'Microsoft.Authorization/roleAssignments@2020-04-01-preview' = {
  name: guid(keyvault.id, adminPrincipalId)
  scope: keyvault
  properties: {
    principalId: adminPrincipalId
    principalType: 'User'
    roleDefinitionId: resourceId('Microsoft.Authorization/roleDefinitions', roles.KeyVaultSecretsOfficer)
  }
}

output keyVaultName string = keyvault.name
