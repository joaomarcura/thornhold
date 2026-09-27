# Code review — 2026-09-26

## Estado verificado

- Branch: `codex/radical-rework`.
- 76 arquivos JavaScript passam por `node --check`.
- 202 testes passam.
- A suíte completa leva aproximadamente 42 segundos nesta máquina.
- O snapshot 1×5 está dentro do orçamento coberto pelo teste de rede.
- O working tree contém um release grande ainda não consolidado: 51 arquivos rastreados alterados e 13 arquivos novos.

## Correção desta revisão

O loop da última partida não exigia uma segunda memória de campanhas. O problema era a integração dos sistemas existentes:

1. o terceiro reposicionamento encerrava o combate, mas não era registrado como falha estratégica;
2. a recuperação podia restaurar `campaignTargetId` sem consultar `targetSuppressed`;
3. a rotação normal perdia alternativas quando elas saíam da memória curta de `AIController`, embora continuassem no `StrategicMap`.

O patch agora registra o loop como falha estratégica, usa `targetFailures`/supressão normalmente, impede a retomada de alvo suprimido e consulta as observações persistentes do `StrategicMap` para escolher outra base conhecida.

## Achados priorizados

### P1 — Uma exceção em uma sala pode interromper todas as salas

O loop global chama `room.match.step(...)` sem isolamento por sala. Uma exceção de simulação escapa do callback do `setInterval` e pode encerrar o processo Node, derrubando todas as partidas do container.

Recomendação: encapsular cada tick de sala, marcar somente a sala afetada como encerrada por erro, persistir diagnóstico estruturado e continuar processando as demais.

### P1 — Snapshot e delta são reconstruídos para cada conexão no caminho crítico do tick

A cada janela de snapshot, `match.snapshot(viewerId)`, o diff completo e `JSON.stringify` são executados separadamente para cada membro. Isso é correto para fog of war e dados privados, mas escala aproximadamente com `salas × jogadores × entidades` dentro do mesmo event loop.

Recomendação: medir por número de salas e dividir o snapshot em uma parte pública/time reutilizável e uma parte privada por jogador. Não otimizar sem perfil de carga real.

### P1 — O relógio do jogo depende da pontualidade de `setInterval`

Cada callback avança um `dt` fixo. Quando o event loop atrasa, o tempo de jogo também atrasa; sob carga, “60 minutos” de partida podem exceder 60 minutos reais.

Recomendação: usar relógio monotônico com acumulador e limitar catch-up por iteração. A regra deve definir explicitamente se o limite da partida é tempo de simulação ou tempo real.

### P2 — A comparação do delta serializa objetos repetidamente

`snapshot-delta.js` usa `JSON.stringify` como igualdade profunda em campos de cada entidade, além da serialização final da mensagem. Isso aumenta alocação e coleta de lixo justamente no caminho de 10 Hz.

Recomendação: manter versões/revisões por entidade ou comparar campos escalares conhecidos. Validar o ganho com `snapshotBuildMs`, `snapshotSerializeMs` e heap antes/depois.

### P2 — Responsabilidades críticas estão concentradas em arquivos e métodos muito grandes

- `client/main.js`: cerca de 92 mil caracteres.
- `shared/simulation.js`: cerca de 77 mil caracteres.
- `shared/troll-brain.js`: cerca de 41 mil caracteres e um `tick` que mistura percepção, economia, risco, recuperação, campanha, seleção e movimento.

Essa concentração permitiu que a retomada de campanha ignorasse a supressão já implementada em outro trecho.

Recomendação: extrair funções puras para seleção de alvo, transição de campanha e recuperação; preservar `TrollBrain` como coordenador. Fazer em patches pequenos, protegidos pelos testes comportamentais atuais.

### P2 — Um teste de simulação domina o tempo da suíte unitária

O teste de partidas autônomas executa até 54 mil passos e consumiu aproximadamente 38 dos 42 segundos da suíte. Ele é valioso, mas deixa o feedback local desnecessariamente lento.

Recomendação: manter o cenário, porém separar comandos:

- `test:unit`: regras rápidas e determinísticas;
- `test:simulation`: partidas autônomas e seeds de regressão;
- `release:check`: ambos;
- desenvolvimento local: `test:unit` por padrão.

### P2 — Persistência de partida não possui confirmação nem retry

`room.logged` é definido antes de `writeMatch` terminar. Se a persistência falhar, o erro é apenas registrado e aquela partida não é tentada novamente.

Recomendação: fila limitada de persistência com retry e idempotency key por partida. Para Azure, preferir stdout/Log Analytics ou storage externo em vez do filesystem efêmero do container.

### P3 — Erros de WebSocket são descartados

O handler `ws.on('error', () => {})` evita crash, mas remove informações úteis para distinguir desconexão normal, backpressure e falha de rede.

Recomendação: registrar código/contexto sem dados pessoais, com amostragem para não gerar excesso de logs.

### P3 — O check atual é apenas sintático

`npm run check` executa `node --check`; não há lint, typecheck ou análise de imports/contratos. Para um código autoritativo que cresceu rapidamente, isso deixa erros de forma de objeto e estados opcionais somente para os testes encontrarem.

Recomendação: adotar gradualmente TypeScript via `checkJs`/JSDoc antes de uma migração completa, começando por `shared/config`, snapshots, comandos e telemetria.

## Ordem recomendada

1. Consolidar e versionar o release atual antes de novas mudanças grandes.
2. Isolar falhas por sala no loop do servidor.
3. Separar testes rápidos de simulações longas.
4. Rodar carga real com múltiplas salas e usar as métricas já existentes.
5. Otimizar snapshots somente com evidência do perfil.
6. Decompor `TrollBrain`, `Match` e `client/main` incrementalmente.
7. Tornar persistência confiável fora do filesystem do container.

Não foi identificado motivo para reescrever a arquitetura do jogo. Os principais riscos vêm de integração entre sistemas maduros, concentração de responsabilidades e ausência de isolamento operacional entre salas.
