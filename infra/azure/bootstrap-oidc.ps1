param(
  [Parameter(Mandatory=$true)][string]$SubscriptionId,
  [string]$GitHubOwner = 'pmarcura',
  [string]$GitHubRepository = 'thornhold',
  [string]$GitHubEnvironment = 'production',
  [string]$Location = 'brazilsouth',
  [string]$ResourceGroup = 'rg-thornhold-prod',
  [string]$IdentityName = 'id-thornhold-github',
  [string]$ContainerAppName = 'thornhold-prod-pmarcura',
  [string]$RegistryName = 'thornholdpmarcura'
)

$ErrorActionPreference = 'Stop'
az account set --subscription $SubscriptionId
az group create --name $ResourceGroup --location $Location --tags Project=thornhold Environment=production ManagedBy=bicep | Out-Null

$identity = az identity create --name $IdentityName --resource-group $ResourceGroup | ConvertFrom-Json
$registryScope = az acr show --name $RegistryName --resource-group $ResourceGroup --query id --output tsv
$appScope = az containerapp show --name $ContainerAppName --resource-group $ResourceGroup --query id --output tsv
az role assignment create --assignee-object-id $identity.principalId --assignee-principal-type ServicePrincipal --role AcrPush --scope $registryScope | Out-Null
az role assignment create --assignee-object-id $identity.principalId --assignee-principal-type ServicePrincipal --role 'Container Apps Contributor' --scope $appScope | Out-Null

$subject = "repo:$GitHubOwner/$GitHubRepository`:environment:$GitHubEnvironment"
az identity federated-credential create --name github-$GitHubEnvironment --identity-name $IdentityName --resource-group $ResourceGroup --issuer https://token.actions.githubusercontent.com --subject $subject --audiences api://AzureADTokenExchange | Out-Null

$tenantId = az account show --query tenantId --output tsv
Write-Host ''
Write-Host 'Configure these GitHub environment secrets:'
Write-Host "AZURE_CLIENT_ID=$($identity.clientId)"
Write-Host "AZURE_TENANT_ID=$tenantId"
Write-Host "AZURE_SUBSCRIPTION_ID=$SubscriptionId"
Write-Host ''
Write-Host 'Configure these GitHub environment variables:'
Write-Host "AZURE_RESOURCE_GROUP=$ResourceGroup"
Write-Host "AZURE_CONTAINER_APP=$ContainerAppName"
Write-Host "AZURE_CONTAINER_REGISTRY=$RegistryName"
Write-Host "AZURE_LOCATION=$Location"
Write-Host 'AZURE_MONTHLY_BUDGET_USD=25'
Write-Host 'AZURE_BUDGET_EMAIL=YOUR_EMAIL'
