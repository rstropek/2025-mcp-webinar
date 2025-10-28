targetScope = 'subscription'

@description('Name of the RG')
param rgName string

@description('Name of the project')
param projectName string

@description('Location of the resources')
param location string

resource rg 'Microsoft.Resources/resourceGroups@2024-11-01' = {
  name: rgName
  location: location
  tags: {
    Project: projectName
  }
}

output rgName string = rg.name
output subscriptionId string = subscription().subscriptionId