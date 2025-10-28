param location string = resourceGroup().location
param projectName string
param stage string
param tags object
param managedIdPrincipalId string
param managedIdResourceId string
param adminPrincipalId string

module kvModule './keyvault.bicep' = {
  name: '${deployment().name}-keyvault'
  params: {
    location: location
    projectName: projectName
    stage: stage
    adminPrincipalId: adminPrincipalId
    managedIdPrincipalId: managedIdPrincipalId
    tags: tags
  }
}

module appService './app-service.bicep' = {
  name: '${deployment().name}-appservice'
  params: {
    location: location
    projectName: projectName
    stage: stage
    managedIdPrincipalId: managedIdResourceId
    tags: tags
    kvName: kvModule.outputs.keyVaultName
  }
}
