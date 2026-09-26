# Thornhold no Azure Container Apps

## Escolha para a primeira alpha

O alvo é Azure Container Apps no plano Consumption, região `brazilsouth`, com
0,5 vCPU, 1 GiB, `minReplicas=0` e `maxReplicas=1`. Uma réplica máxima é um
guardrail financeiro e também preserva o modelo atual, no qual salas e partidas
vivem na memória de um único processo.

O template `infra/azure/main.bicep` cria:

- Container Apps Environment;
- Azure Container Registry Basic, sem usuário administrador;
- Container App com HTTPS/WSS, sticky session e revisão única;
- probes de startup, readiness e liveness em `/health`;
- Log Analytics com retenção de 30 dias e quota de 0,5 GB/dia;
- orçamento opcional de US$25/mês com alertas em 50%, 80% e 100%;
- escala estritamente limitada a zero ou uma réplica;
- parâmetros de limite de salas e conexões;
- telemetria JSON em stdout, persistida fora do filesystem do container.

## 1. Criar conta e assinatura

Crie uma conta Azure, uma assinatura Pay-As-You-Go e confirme que ela permite a
região Brazil South. Não crie AKS, Application Gateway, Redis, PostgreSQL ou ACR
nesta fase.

Depois instale ou abra Azure CLI e autentique:

```powershell
az login
az account list --output table
```

## 2. Preparar OIDC do GitHub

O pipeline usa identidade federada, sem client secret Azure permanente. A
identidade recebe somente `AcrPush` no registry e `Container Apps Contributor`
no Container App específico; ela não controla o resource group, orçamento,
logs ou roles. Execute:

```powershell
./infra/azure/bootstrap-oidc.ps1 -SubscriptionId SUA_SUBSCRIPTION_ID
```

O script registra os providers, cria `rg-thornhold-prod`, cria uma identidade
gerenciada e limita o acesso dela a `AcrPush` no registry e
`Container Apps Contributor` somente no Container App. Depois imprime os
valores necessários para o environment `production` do GitHub.

Crie em GitHub → Settings → Environments → `production`:

Secrets:

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`

Variables:

- `AZURE_RESOURCE_GROUP=rg-thornhold-prod`
- `AZURE_CONTAINER_APP=thornhold-prod-SUFIXO-UNICO`
- `AZURE_CONTAINER_REGISTRY=thornholdSUFIXOUNICO` (somente letras e números minúsculos)

O ACR usa identidade gerenciada para pull e mantém o usuário administrador
desativado. Isso acrescenta o custo do tier Basic, mas remove tokens permanentes
de registry e mantém build, armazenamento e deploy dentro da assinatura Azure.

## 3. Validar a infraestrutura

O Bicep pode ser compilado sem fazer alterações na assinatura:

```powershell
az bicep build --file infra/azure/main.bicep --stdout > $null
```

Depois de autenticado, faça um what-if antes do primeiro deploy:

```powershell
az deployment group what-if `
  --resource-group rg-thornhold-prod `
  --template-file infra/azure/main.bicep `
  --parameters appName=thornhold-prod-SUFIXO-UNICO `
               registryName=thornholdSUFIXOUNICO `
               image=thornholdSUFIXOUNICO.azurecr.io/thornhold:COMMIT `
               metricsToken=SEGREDO `
               budgetEmail=SEU_EMAIL
```

## 4. Fazer release

`.github/workflows/release-azure.yml` roda manualmente ou em tags `v*`:

1. valida sintaxe e 148 testes;
2. roda carga WebSocket com oito salas 1×5;
3. constrói a imagem Docker no runner e envia uma tag imutável ao ACR;
4. autentica no Azure por OIDC e permissões restritas;
5. captura a imagem atual para rollback;
6. atualiza somente a imagem e os limites 0–1 da aplicação;
7. testa `/health` publicamente por até 150 segundos;
8. executa um smoke test WebSocket 1×5 no endereço público;
9. restaura a imagem anterior se o health check ou o smoke test falhar.

O antigo pipeline AWS ficou manual e não será disparado por tags.

## Custo e operação

`minReplicas=0` é a configuração mais barata e introduz cold start na primeira
conexão. Durante uma partida, a conexão WebSocket mantém a réplica ativa. Quando
a alpha precisar responder instantaneamente, execute o workflow manualmente com
`min_replicas=1`.

O orçamento Azure é um alerta, não um hard cap. Os hard caps práticos são:

- `maxReplicas=1` validado pelo Bicep;
- 0,5 vCPU e 1 GiB;
- Log Analytics limitado a 0,5 GB/dia;
- `MAX_ROOMS=200`;
- `MAX_CONNECTIONS=1200`;
- `MAX_CONNECTIONS_PER_IP=24`.

Partidas continuam em memória. O servidor agora entra em draining, responde
`503` no health check, recusa novas conexões e aguarda até 20 segundos antes de
encerrar. Isso melhora revisões, mas não migra uma partida para outro container.
Releases da alpha ainda devem ocorrer em janela de manutenção ou sem salas.
