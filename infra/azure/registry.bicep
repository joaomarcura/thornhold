targetScope = 'resourceGroup'

@description('Globally unique lowercase Azure Container Registry name.')
param registryName string
param location string = resourceGroup().location

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: registryName
  location: location
  tags: {
    Project: 'thornhold'
    Environment: 'production'
    ManagedBy: 'bicep'
  }
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
  }
}

output loginServer string = registry.properties.loginServer
output registryResourceId string = registry.id
