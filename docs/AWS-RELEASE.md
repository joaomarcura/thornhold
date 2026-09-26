# Release do Thornhold na AWS

## Arquitetura do primeiro staging

Use um serviço ECS Fargate stateful em `sa-east-1`, atrás de um Application
Load Balancer com HTTPS/WSS e sticky sessions. Comece com uma task de 0,5 vCPU
e 1 GB. Não ative autoscaling antes de existir roteamento de sala ou estado
compartilhado: duas tasks sem afinidade podem separar jogadores da mesma sala.

O container escreve telemetria em stdout. A configuração `awslogs` envia essas
linhas ao CloudWatch Logs e reconhece as linhas `runtime_metrics` como Embedded
Metric Format. Resultados deixam de depender de `telemetry/` dentro do
container. Defina retenção do log group `/ecs/thornhold` em 14 dias; exportação
histórica para S3 pode ser adicionada depois sem tocar no loop do jogo.

## Bootstrap único

1. Crie ECR, ECS cluster, ALB HTTPS/WSS, target group na porta 3000 e log group
   `/ecs/thornhold` com retenção de 14 dias.
2. Registre uma task definition baseada em
   `infra/aws/task-definition.example.json`, substituindo conta e role.
3. Configure o ECS Service com `desiredCount=1`, circuit breaker com rollback e
   sticky session no target group.
4. Crie uma role OIDC do GitHub limitada ao repositório, ECR e serviço ECS.
5. Guarde `METRICS_TOKEN` no Secrets Manager e injete-o como `secret` na task
   definition. Em produção, `/metrics` permanece fechado se o token não existir.
6. No environment `production` do GitHub configure:
   `AWS_ROLE_ARN`, `AWS_REGION=sa-east-1`, `ECR_REPOSITORY`, `ECS_CLUSTER`,
   `ECS_SERVICE`, `ECS_TASK_DEFINITION` e `MAX_DESIRED_TASKS=1`.
7. Proteja o environment com aprovação manual enquanto o produto estiver em
   alpha.

Uma tag `v*` ou execução manual dispara `.github/workflows/release.yml`. O
pipeline roda sintaxe, 146 testes, carga real com oito salas, constrói uma
imagem identificada pelo commit, publica no ECR, reutiliza a task definition
atual e espera a estabilização. Falha de health check ativa rollback automático.

## Limites de custo e abuso

Parâmetros iniciais recomendados:

| Parâmetro | Inicial | Função |
|---|---:|---|
| Fargate desired tasks | 1 | custo computacional previsível |
| `MAX_DESIRED_TASKS` | 1 | impede o pipeline de atualizar um serviço já escalado além do aprovado |
| CPU / memória | 512 / 1024 | tamanho inicial da task |
| CloudWatch retention | 14 dias | limita armazenamento de logs |
| `MAX_ROOMS` | 200 | recusa novas salas antes de saturar a task |
| `MAX_CONNECTIONS` | 1200 | teto global de sockets |
| `MAX_CONNECTIONS_PER_IP` | 24 | reduz abuso e testes acidentais |
| AWS Budget | US$ 75/mês | alertas em 50% previsto, 80% real e 100% real |

Implante `infra/aws/budget.yml` depois de ativar a tag de alocação de custo
`Project`. Exemplo:

```powershell
aws cloudformation deploy `
  --region sa-east-1 `
  --stack-name thornhold-budget `
  --template-file infra/aws/budget.yml `
  --parameter-overrides MonthlyBudgetUsd=75 AlertEmail=SEU_EMAIL ProjectTagValue=thornhold
```

AWS Budgets envia alertas e não é um hard cap em tempo real. Os limites de
tasks, retenção e aplicação são os guardrails efetivos; qualquer ação automática
de desligamento deve ser adicionada somente depois de definir quem pode parar o
ambiente e como partidas ativas são tratadas.

## Operação

- `GET /health`: health check leve, incluindo P95 e overruns do tick.
- `GET /metrics`: diagnóstico completo; em produção requer
  `Authorization: Bearer $METRICS_TOKEN`.
- `TELEMETRY_MODE=stdout`: produção/CloudWatch.
- `TELEMETRY_MODE=file`: desenvolvimento local.
- `TELEMETRY_MODE=off`: testes isolados.
- `npm run test:load`: gate 1x; use `LOAD_SPEED=8` apenas para estresse.

Limitação conhecida: partidas ainda estão em memória. Rolling deploy evita
indisponibilidade do endpoint, mas não migra uma partida conectada à task antiga.
Até implementar drenagem e persistência de sessão, releases devem ocorrer em
janela anunciada ou quando não houver salas ativas.
