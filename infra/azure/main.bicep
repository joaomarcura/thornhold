targetScope = 'resourceGroup'

@description('Globally unique Container App name.')
param appName string

@description('Immutable image reference, normally ghcr.io/owner/repository:<commit>.')
param image string
param registryName string

param location string = resourceGroup().location
param environmentName string = '${appName}-env'
param logWorkspaceName string = '${appName}-logs'
param cpu string = '0.5'
param memory string = '1Gi'

@minValue(0)
@maxValue(1)
param minReplicas int = 0

@minValue(1)
@maxValue(1)
param maxReplicas int = 1

@secure()
param metricsToken string

@description('Optional email. When supplied, creates a resource-group monthly budget.')
param budgetEmail string = ''

@minValue(10)
@maxValue(500)
param monthlyBudgetUsd int = 25

param budgetStartDate string = utcNow('yyyy-MM-01')

var commonTags = {
  Project: 'thornhold'
  Environment: 'production'
  ManagedBy: 'bicep'
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: registryName
}

resource pullIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${appName}-pull'
  location: location
  tags: commonTags
}

resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, pullIdentity.id, 'acrpull')
  scope: registry
  properties: {
    principalId: pullIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
  }
}

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logWorkspaceName
  location: location
  tags: commonTags
  properties: {
    retentionInDays: 30
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
    workspaceCapping: {
      dailyQuotaGb: json('0.5')
    }
  }
}

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: environmentName
  location: location
  tags: commonTags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
    zoneRedundant: false
  }
}

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: appName
  location: location
  tags: commonTags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${pullIdentity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      maxInactiveRevisions: 2
      ingress: {
        external: true
        allowInsecure: false
        targetPort: 3000
        transport: 'auto'
        stickySessions: {
          affinity: 'sticky'
        }
      }
      secrets: [
        {
          name: 'metrics-token'
          value: metricsToken
        }
      ]
      registries: [
        {
          server: registry.properties.loginServer
          identity: pullIdentity.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'thornhold'
          image: image
          resources: {
            cpu: json(cpu)
            memory: memory
          }
          env: [
            { name: 'NODE_ENV', value: 'production' }
            { name: 'HOST', value: '0.0.0.0' }
            { name: 'PORT', value: '3000' }
            { name: 'DEPLOY_ENV', value: 'azure-production' }
            { name: 'TELEMETRY_MODE', value: 'stdout' }
            { name: 'TELEMETRY_PROVIDER', value: 'azure' }
            { name: 'TRUST_PROXY', value: '1' }
            { name: 'MAX_ROOMS', value: '200' }
            { name: 'MAX_CONNECTIONS', value: '1200' }
            { name: 'MAX_CONNECTIONS_PER_IP', value: '24' }
            { name: 'SHUTDOWN_GRACE_MS', value: '20000' }
            { name: 'METRICS_TOKEN', secretRef: 'metrics-token' }
          ]
          probes: [
            {
              type: 'Startup'
              httpGet: { path: '/health', port: 3000, scheme: 'HTTP' }
              initialDelaySeconds: 2
              periodSeconds: 3
              timeoutSeconds: 2
              failureThreshold: 20
            }
            {
              type: 'Readiness'
              httpGet: { path: '/health', port: 3000, scheme: 'HTTP' }
              periodSeconds: 5
              timeoutSeconds: 2
              failureThreshold: 3
            }
            {
              type: 'Liveness'
              httpGet: { path: '/health', port: 3000, scheme: 'HTTP' }
              initialDelaySeconds: 15
              periodSeconds: 15
              timeoutSeconds: 3
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
        rules: [
          {
            name: 'http-concurrency'
            http: {
              metadata: {
                concurrentRequests: '100'
              }
            }
          }
        ]
      }
      terminationGracePeriodSeconds: 30
    }
  }
  dependsOn: [acrPull]
}

resource budget 'Microsoft.Consumption/budgets@2024-08-01' = if (!empty(budgetEmail)) {
  name: '${appName}-monthly'
  properties: {
    category: 'Cost'
    amount: monthlyBudgetUsd
    timeGrain: 'Monthly'
    timePeriod: {
      startDate: '${budgetStartDate}T00:00:00Z'
    }
    notifications: {
      Forecasted_50_Percent: {
        enabled: true
        operator: 'GreaterThan'
        threshold: 50
        thresholdType: 'Forecasted'
        contactEmails: [budgetEmail]
      }
      Actual_80_Percent: {
        enabled: true
        operator: 'GreaterThan'
        threshold: 80
        thresholdType: 'Actual'
        contactEmails: [budgetEmail]
      }
      Actual_100_Percent: {
        enabled: true
        operator: 'GreaterThan'
        threshold: 100
        thresholdType: 'Actual'
        contactEmails: [budgetEmail]
      }
    }
  }
}

output fqdn string = app.properties.configuration.ingress.fqdn
output url string = 'https://${app.properties.configuration.ingress.fqdn}'
output appResourceId string = app.id
output logWorkspaceResourceId string = logs.id
