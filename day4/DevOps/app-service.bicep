param location string = resourceGroup().location
param projectName string
param stage string
param tags object
param kvName string
param managedIdPrincipalId string

var abbrs = loadJsonContent('abbreviations.json')

resource appServicePlan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: '${abbrs.webServerFarms}${uniqueString(projectName, stage)}'
  location: location
  tags: tags
  sku: {
    name: 'P0v3'
    capacity: 1
  }
  kind: 'linux'
  properties: {
    reserved: true // Required for Linux
  }
}

resource webApp 'Microsoft.Web/sites@2024-04-01' = {
  name: '${abbrs.webSitesAppService}${uniqueString(projectName, stage)}'
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${managedIdPrincipalId}': {}
    }
  }
  properties: {
    httpsOnly: true
    publicNetworkAccess: 'Enabled'
    serverFarmId: appServicePlan.id
    keyVaultReferenceIdentity: managedIdPrincipalId
    siteConfig: {
      linuxFxVersion: 'DOCKER|rstropek/mcp-mylittlepony:latest'
      alwaysOn: true
      cors: {
        allowedOrigins: ['*']
      }
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
    }
 }

  resource settings 'config@2024-04-01' = {
    name: 'appsettings'
    properties: {
      SCALEKIT_ENVIRONMENT_URL: '@Microsoft.KeyVault(VaultName=${kvName};SecretName=scalekitenvironmenturl)'
      SCALEKIT_AUTH_SERVER: '@Microsoft.KeyVault(VaultName=${kvName};SecretName=scalekitauthserver)'
      SCALEKIT_CLIENT_ID: '@Microsoft.KeyVault(VaultName=${kvName};SecretName=scalekitclientid)'
      SCALEKIT_CLIENT_SECRET: '@Microsoft.KeyVault(VaultName=${kvName};SecretName=scalekitclientsecret)'
      MCP_RESOURCE_ID: '@Microsoft.KeyVault(VaultName=${kvName};SecretName=mcpresourceid)'
      MCP_SCOPES: '@Microsoft.KeyVault(VaultName=${kvName};SecretName=mcpscopes)'
    }
  }
}
