# Revisão de performance e preparação para AWS

## Diagnóstico de 25 de setembro de 2026

O travamento percebido não é causado pela quantidade de testes. Os testes não
são carregados pelo navegador e o `Dockerfile` copia somente `client`, `shared`
e `server`. A suíte completa possui 143 casos e terminava em aproximadamente 12
segundos; um único teste autônomo 1x5 concentrava a maior parte desse tempo.

Os gargalos encontrados no caminho de produção foram:

1. Snapshot de espectador com aproximadamente 68,8 KB a 10 Hz, equivalente a
   cerca de 5,1 Mbps antes do overhead do WebSocket.
2. Até 120 eventos antigos eram repetidos em cada snapshot. Em uma partida de
   10 minutos, eventos representavam aproximadamente 22 KB por pacote.
3. Objetos autoritativos de estruturas e Wisps eram quase integralmente
   copiados para a rede, incluindo contabilidade interna.
4. A animação de cada Wisp alocava nove `Vector3` por frame, criando pressão
   contínua no garbage collector.
5. Placar e dicas de controle eram reconstruídos no DOM aproximadamente seis
   vezes por segundo mesmo sem mudança.
6. Sombras 2048² e pixel ratio de até 1,7 elevavam muito o custo da GPU em telas
   de alta densidade.
7. A porta 3000 estava servindo a cópia antiga `thornhold`, enquanto o trabalho
   atual está em `thornhold-radical-rework`.

## Correções desta rodada

- Snapshot usa modelos públicos explícitos para estruturas, Wisps e árvores.
- Histórico visível limitado a 32 eventos e entrega incremental por conexão.
- Snapshot do espectador caiu de 68,8 KB para aproximadamente 47,5 KB no mesmo
  estado de uma partida 1x5, redução inicial de 31%.
- Seleção de árvores deixou de fazer busca quadrática.
- Vetores da animação dos Wisps são reutilizados.
- Estado de `reduced motion` é consultado uma vez por frame.
- Pixel ratio máximo reduzido para 1,35 e shadow map para 1024².
- Placar e dicas do HUD somente atualizam o DOM quando o conteúdo muda.
- Teste automatizado impede snapshots de observador acima de 55 KB no cenário
  padrão e impede retorno dos campos internos removidos.
- `npm run test:smoke` oferece retorno rápido; `npm test` continua sendo o
  portão completo antes de release.

## Decisão sobre os testes

Não remover testes por contagem. Eles não afetam FPS, pacote do navegador nem a
imagem Docker. A divisão recomendada é:

- Durante desenvolvimento: `npm run test:smoke`.
- Antes de merge/release: `npm test`.
- Antes de staging: `npm run verify` e arena 1x5 com seeds versionadas.

Testes lentos de simulação podem futuramente ser movidos para uma etapa de CI
separada, mas devem continuar existindo porque detectam loops infinitos e
regressões de IA que testes unitários não enxergam.

## Arquitetura inicial recomendada na AWS

Não dividir o loop da partida em microserviços neste momento. Uma partida é um
estado fortemente acoplado executado a 20 Hz; distribuí-la aumentaria latência e
complexidade antes de haver volume real.

Para o primeiro staging no Brasil:

1. Uma imagem Docker deste serviço em ECS Fargate ou App Runner, região
   `sa-east-1`.
2. Application Load Balancer com TLS e WebSocket.
3. Uma única instância stateful inicialmente. Ao escalar, usar afinidade por
   sala ou um roteador de salas; não fazer round-robin entre ticks da mesma
   partida.
4. Logs estruturados em stdout/CloudWatch. O arquivo local
   `telemetry/matches.jsonl` não deve ser a persistência de produção porque o
   filesystem do container é efêmero.
5. Resultados e baselines em S3 ou banco persistente, fora do loop de 20 Hz.
6. Alarmes para duração do tick, memória, conexões, bytes enviados e
   `bufferedAmount` do WebSocket.

## Critérios antes do staging

- [x] Teste de carga com múltiplas salas 1x5, espectadores e WebSocket real.
- [x] Métricas de duração do tick, memória, conexões, bytes e descarte de
  mensagens em `/metrics` e CloudWatch EMF.
- [x] Persistência de partidas e métricas em stdout/CloudWatch no container.
- [x] Pipeline imutável Docker → ECR → ECS com teste, estabilidade e rollback
  automático pelo circuit breaker.
- P95 do tick abaixo de 25 ms; nenhum tick acima do orçamento de 50 ms de forma
  recorrente. Em 8 salas simultâneas a 1x, a medição local inicial foi P95
  11,81 ms, máximo 33,24 ms e zero overruns.
- FPS validado em notebook integrado e desktop comum.
- Tráfego por jogador medido em early, siege e late game.
- Graceful shutdown/migração de partidas continua pendente antes de permitir
  deploy sem janela de manutenção. O pipeline faz rolling deploy e rollback,
  mas o estado da partida ainda vive em memória.
- Ferramentas dev desabilitadas e origem/TLS validados no ambiente público.

## Revisão de código desta etapa

- O hot path permanece síncrono e não grava arquivos durante cada tick.
- Métricas guardam no máximo 1.200 amostras, evitando crescimento de memória.
- Serialização WebSocket é feita uma vez por mensagem e contabilizada no mesmo
  ponto de envio.
- Backpressure descarta snapshots quando `bufferedAmount` chega a 1 MB e agora
  torna esses descartes observáveis.
- Limites configuráveis protegem salas, conexões totais e conexões por IP.
- Testes continuam fora da imagem final e não afetam FPS nem custo de runtime.
