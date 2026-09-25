# Thornhold V2 — Balance & AI System

## Princípio

Nenhum sistema da V2 decide secretamente quem vence. Match State, mapa estratégico, IA, cerco, economia e Balance Lab orientam comportamento, progressão e diagnóstico; vitória continua sendo consequência das regras autoritativas e das ações dos jogadores.

O formato de produto e o padrão de balanceamento é **1 Troll × 5 Elfos**. Outros tamanhos só entram em análises explicitamente configuradas.

## Ordem de implementação

1. V2.1 — Observability.
2. V2.2 — Strategic Memory.
3. V2.3 — Troll State Machine.
4. V2.4 — Siege Intelligence.
5. V2.5 — Retreat Rewrite.
6. V2.6 — Troll Economy.
7. V2.7 — Elf Economy Analysis.
8. V2.8 — Combat Calibration.

## V2.1 — Observability

Esta etapa não altera atributos, decisões ou regras. A telemetria é escrita pela simulação, mas nunca é lida pelos controladores.

### Match State

O relatório calcula a cada cinco segundos:

- fase (`HUNT`, `PRESSURE`, `SIEGE`, `ENDGAME`);
- tempo ativo;
- poder estimado de cada lado;
- pressão recente;
- economia;
- Elfos ativos;
- controle de mapa;
- volatilidade.

`elfPower` e `trollPower` são indicadores diagnósticos, não buffs e não probabilidades de vitória.

### Setores

O mapa é observado em uma grade diagnóstica 6×6. Cada setor registra visitas, tempo, último contato, dano causado/recebido, destruições e IDs conhecidos pela memória real do bot.

A confiança decai apenas no relatório:

`confidence = exp(-secondsSinceVisit / 120)`

Ela ainda não é usada pela IA. Isso será responsabilidade da V2.2.

### Cercos e Trade Score

Uma sessão começa quando o cérebro entra em `SIEGE` e termina quando sai. O relatório guarda duração, HP gasto, dano, estruturas destruídas, dano econômico, curas e estado de saída.

O primeiro score diagnóstico usa:

`numerator = valueDestroyed + killProgress * 80 + structureDamage / 100`

`denominator = hpLossPercent + healsUsed * 10 + duration * 0.5`

`tradeScore = numerator / max(1, denominator)`

Os pesos são versionados como `v2.1-observability-1`. O score serve para comparar ataques; não controla retreat nem target selection nesta etapa.

### Pressão e momentum

Janelas de 60 segundos armazenam componentes brutos e scores diagnósticos dos dois lados. Momentum é a diferença em relação à janela anterior. Nenhum score aplica rubber-band ou modifica atributos.

### Economia

Snapshots são registrados em 3, 5, 8, 10, 12 e 15 minutos, contendo geração, gasto, estoque, renda atual, estruturas, tiers e upgrades. O Balance Lab agrega esses checkpoints entre partidas.

### Tempo por estado

O relatório contabiliza os estados atuais (`SCOUT`, `PURSUE`, `SIEGE`, `RETREAT`, `RECOVER`, `ROTATE` e outros) e suas transições. Os estados novos da V2 só serão introduzidos na V2.3.

## V2.2 — Strategic Memory

Cada cérebro de Troll possui agora uma memória estratégica persistente 6×6. Ela recebe somente entidades realmente visíveis ao Troll e mantém estruturas antigas como lembranças incertas; unidades expiram rapidamente.

Por setor são calculados:

- última visita e último inimigo visto;
- Elfos e estruturas conhecidos;
- DPS estimado de torres;
- HP estrutural e economia estimados;
- risco e valor estratégico;
- custo de viagem;
- cercos anteriores, sucessos e falhas;
- dano recebido e causado;
- confiança exponencialmente decrescente.

A memória aparece em `result.ai[].strategicMemory`. Nesta etapa ela ainda não substitui a seleção de alvo existente; isso evita misturar a criação do modelo com a mudança comportamental da V2.3.

## V2.3 — Troll State Machine

O cérebro trabalha agora com os estados explícitos:

- `EXPLORE` — procurar novas regiões;
- `HUNT` — aproximar-se de uma lembrança ou alvo distante;
- `PROBE` — observar uma defesa desconhecida durante três segundos;
- `SIEGE` — atacar uma estrutura escolhida;
- `CHASE` — perseguir uma unidade;
- `REPOSITION` — reservado para a separação tática da V2.5;
- `DISENGAGE` — sair efetivamente do combate;
- `RECOVER` — recuperar vida em segurança;
- `ROTATE` — abandonar um setor/estratégia local.

As fases `HUNT`, `PRESSURE`, `SIEGE` e `ENDGAME` mudam somente os pesos de prioridade. Não concedem atributos.

Todos os alvos visíveis passam pela mesma avaliação de economia, kill, cerco, negação de progressão, vulnerabilidade, oportunidade, risco, viagem e falhas recentes. Torres recebem valor adicional proporcional ao risco que será removido ao destruí-las.

Antes de um cerco desconhecido, o Troll observa de uma distância mais segura. Ele mede dano realmente recebido e usa apenas torres conhecidas. Uma ameaça extrema gera `ROTATE`; informação oculta não participa da decisão. O diagnóstico da avaliação é exportado em `targetEvaluation` e `candidateEvaluations`.

Primeira amostra de 50 seeds, sem mudanças de atributos: 42% de vitórias do Troll, mediana de 10:26, zero partidas inacabadas. Esse resultado ainda não é baseline final; V2.4 e V2.5 precisam reduzir cercos ruins e tempo excessivo de retirada antes da rodada oficial de 100 partidas.

## V2.4 — Siege Intelligence

Cada `SIEGE` possui agora um contexto próprio:

- compromisso mínimo de 4 segundos;
- orçamento nominal de 22% de HP;
- duração nominal de 18 segundos;
- progresso do objetivo;
- probabilidade de conclusão;
- curas consumidas;
- trade score vivo;
- limite mínimo de valor de 0,45.

O compromisso impede reavaliações comuns durante os primeiros quatro segundos, mas risco crítico de morte continua podendo interromper o ataque. Ultrapassar duração ou HP não força saída automaticamente: um ataque produtivo ou perto de destruir o objetivo continua. Uma troca cara sem progresso gera `DISENGAGE` seguido de `ROTATE`, e o setor recebe memória de falha.

O contexto atual é exportado como `siegeDecision`. Esses cálculos mudam decisões, mas continuam sem modificar atributos.

## V2.5 — Retreat Rewrite

`Hardened` e `Last Stand` foram removidos. A quantidade de recuos nunca desliga a autopreservação.

A necessidade de retirada considera:

- risco de morte;
- dificuldade da rota de fuga;
- troca negativa;
- probabilidade de concluir o objetivo;
- sustain disponível.

`REPOSITION` dura no máximo quatro segundos, possui cooldown e bloqueia temporariamente o ângulo abandonado. `DISENGAGE` fica reservado a risco real de morte. Em recuperação segura, a IA pode usar uma carga de cura, avaliar o custo de viagem ao Santuário e aceitar um reset menor no `ENDGAME`.

Cinco cercos globais fracassados mudam a estratégia entre Hunter, Raider e Siegebreaker em vez de ignorar risco.

A primeira amostra isolada de 20 seeds terminou 18 partidas e deu 30% de vitórias ao Troll. É um resultado intermediário esperado: a autopreservação deixou explícito o custo econômico do tempo de recuperação. A V2.6 deve corrigir essa dependência sem reintroduzir comportamento suicida.

## Balance Lab

`npm run simulate:arena` usa 1×5 por padrão. Para uma análise secundária explícita, `SIM_ELF_COUNTS` pode fornecer outros tamanhos.

O artefato agrega:

- tempo por estado;
- cercos por partida;
- sucesso de cerco;
- duração, HP gasto e trade score;
- setores visitados;
- pressure gap;
- checkpoints econômicos.

Win rate permanece uma métrica de validação, não o algoritmo do jogo.
