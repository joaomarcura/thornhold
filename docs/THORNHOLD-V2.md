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

## V2.6 — Economia do Troll

A renda do Troll passa a ter três fontes auditáveis:

- `damage` — continua sendo a fonte principal e usa o número inicial de Elfos no scaling;
- `objectives` — descoberta de bases, eliminações e destruição de estruturas;
- `threat` — uma renda pequena, limitada, proporcional à economia e às estruturas avançadas dos Elfos.

Eliminar um Elfo nunca reduz o multiplicador de renda por dano. O scaling usa a população inicial da partida, enquanto o componente de ameaça acompanha a força econômica atual. Todas as fontes aparecem em `players[].goldFromDamage`, `goldFromObjectives` e `goldFromThreat`, e o Balance Lab agrega valores e percentuais em `summary.trollEconomy`.

Na primeira amostra de 20 seeds 1×5 a composição média foi 79,1% dano, 5,3% objetivos e 15,6% ameaça. O resultado foi 10 vitórias do Troll, 6 dos Elfos e 4 partidas ainda ativas aos 20 minutos. A mediana foi 10:15. Essa amostra valida a faixa pretendida da economia híbrida, mas não é baseline final: os quatro casos longos apresentaram cercos reais e crescimento econômico, não ausência de alvo, e serão tratados pela análise econômica V2.7 e pela calibração V2.8.

## V2.7 — Análise da economia dos Elfos

Toda despesa é classificada simultaneamente por propósito (`economy`, `defense`, `other`) e ação (`construction`, `upgrade`, `training`, `repair`). Formação e evolução de Wisps e reparos pagos, que antes não apareciam no total gasto, agora entram na contabilidade. Cancelamentos e demolições possuem ledger de reembolso separado; os snapshots guardam cópias imutáveis dos ledgers.

Os checkpoints incluem geração, gasto bruto, reembolso, gasto líquido, estoque, utilização de ouro/madeira e detalhes por perfil de bot. `npm run audit:economy -- <artefato>` produz cortes por tempo, perfil e resultado.

Na amostra determinística de 20 seeds, sem nenhuma mudança de gameplay:

- uso de ouro: 89,9% aos 3 min, 90,3% aos 5 min e 89,2% aos 8 min;
- saturação: 74,5% aos 10 min, 60,6% aos 12 min e 47,7% aos 15 min;
- estoque médio aos 15 min: 45.329 de ouro;
- investimento agregado em ouro favoreceu economia sobre defesa em 2,82×;
- o perfil econômico teve a menor utilização média de ouro (74,4%) e apenas 436 de investimento defensivo médio, contra 4.213 em economia.

O diagnóstico é saturação de decisões no late game, não escassez. Portanto a V2.7 não reduz renda: esses dados serão usados na V2.8 para calibrar prioridades e curvas sem mascarar a causa.

## V2.8 — Calibração de IA e combate

O laboratório de sensibilidade executa as mesmas seeds com variações de ±5% em dano de torre, HP e dano do Troll, HP da barricada, ouro por dano, Exposure e Threat Income. O relatório mede delta de vitória, duração, partidas precoces, partidas abertas, flips pareados e fragilidade.

A análise encontrou duas falhas comportamentais antes de qualquer ajuste de atributos:

1. A IA Elfa tratava distância como bloqueio estratégico. Um bot longe da estrutura não planejava caminhar até ela para evoluí-la, mesmo com recursos abundantes. Agora somente distância significa “vá até o alvo”; custos, propriedade, tiers e pré-requisitos continuam autoritativos.
2. Após os quatro segundos de compromisso, o Troll podia reposicionar por trade baixo antes de exceder o Siege Budget. Durante um cerco, saídas táticas comuns agora pertencem ao orçamento adaptativo; risco real de morte continua tendo precedência.

Depois dessas correções, 100 partidas 1×5 sem ajuste de stats produziram 57 Troll, 39 Elfos e 4 ainda ativas aos 20 minutos, com mediana de 9:55. O uso de ouro dos Elfos aos 15 minutos subiu de 47,7% para 76,6%.

Quatro pacotes pequenos foram comparados em seeds pareadas. O melhor candidato foi `+5% HP de Barricada / +3% dano da torre comum`: aumentou a mediana sem deslocar fortemente a taxa de vitória. Os valores oficiais passaram de 1100 para 1155 HP e de 10,5 para 10,815 de dano. A torre lendária não foi alterada.

Baseline calibrado de 100 partidas com teto diagnóstico de 30 minutos:

- 53 vitórias do Troll, 43 dos Elfos e 4 partidas ainda ativas;
- entre partidas concluídas: 55,2% Troll / 44,8% Elfos;
- mediana 10:59, P90 19:28;
- 4% abaixo de quatro minutos e 36% abaixo de dez minutos;
- 51,5% de sucesso em cercos e 14,68 cercos por partida;
- pressure gap médio de −13,83;
- 4% permaneceram ativas aos 30 minutos, todas com combate recente e objetivos restantes.

A meta de vitória está atendida no limite superior. A duração melhorou, mas ainda está abaixo da mediana aspiracional de 13–15 minutos; novos aumentos simples de HP elevaram partidas abertas e não serão aplicados sem playtest humano.

## V2.9 — Abertura defensiva e patrulha contínua

A IA Elfa agora trata Barricada 2 como parte obrigatória da abertura, antes de Núcleo 2 e da primeira Mina. Dano crítico ainda prioriza reparo, mas uma Barricada saudável e com recursos disponíveis não fica presa no loop de reparo quando pode evoluir. Durante um cerco visível, bots não iniciam novas Torres; reparo e upgrades existentes continuam permitidos. Isso eliminou partidas com mais de 450 fundações refeitas no mesmo ataque.

Descobrir uma base pela visão real passou a conceder 75 de ouro ao Troll. A recompensa transforma exploração em progressão sem alterar dano, HP ou atributos por relógio. Quando todo o mapa já foi explorado e as observações expiraram, o Troll reinicia a ronda pelos marcos públicos dos refúgios; ele não recebe a posição do inimigo. A seed `SIM-1`, que antes ficou 925 segundos sem combate, voltou a encontrar a última base e terminou normalmente.

O laboratório também foi corrigido: `scripts/arena.js` usa exclusivamente dificuldade Normal por padrão, conforme a regra do produto. Outras dificuldades exigem `SIM_DIFFICULTIES` explícito. O laboratório de sensibilidade recebeu o mesmo padrão e filtros para candidatos específicos.

Baseline de 100 partidas 1×5 Normal, teto diagnóstico de 30 minutos:

- 47 vitórias do Troll e 53 dos Elfos;
- zero partidas abertas;
- mediana 11:11, P90 22:06;
- uma partida abaixo de quatro minutos e 33 abaixo de dez minutos;
- 48,9% de sucesso em cercos e 14,94 cercos por partida.

`GAME-116` permanece aberto: o equilíbrio e a resolução estão corretos, mas a mediana ainda não atingiu 13–15 minutos.

## V2.10 — Observabilidade de progressão

O resultado de cada partida agora registra o primeiro Lendário, a primeira Torre Lendária, o primeiro Épico, o momento da Espada Lendária e o estado final dos níveis do Troll e das estruturas. `scripts/arena.js` agrega frequência e distribuição desses marcos sem alterar a simulação.

A auditoria de `GAME-116` encontrou uma assimetria estrutural: no lote diagnóstico de 30 seeds, a Espada do Troll apareceu em 27 partidas com mediana ativa de 5:02, enquanto a primeira estrutura Lendária dos Elfos apareceu em apenas cinco, com mediana de 18:37. Experimentos de curva contínua elevaram a mediana até 12:55, mas favoreceram os Elfos e criaram partidas abertas. Experimentos combinando financiamento tardio e dano adicional da Espada removeram parte dos impasses, porém deslocaram o resultado para 57–63% do Troll e reduziram a mediana.

Esses candidatos foram rejeitados e não alteram o balanceamento vigente. O próximo desenho de `GAME-116` deve alinhar o custo e o momento das duas condições Lendárias, em vez de aplicar multiplicadores globais ou transformar estagnação em suicídio da IA. Os artefatos `game116-*.json` preservam as amostras diagnósticas locais.

## Balance Lab

`npm run simulate:arena` usa 1×5 Normal por padrão. Para uma análise secundária explícita, `SIM_ELF_COUNTS` e `SIM_DIFFICULTIES` podem fornecer outros tamanhos e dificuldades.

O artefato agrega:

- tempo por estado;
- cercos por partida;
- sucesso de cerco;
- duração, HP gasto e trade score;
- setores visitados;
- pressure gap;
- checkpoints econômicos.

Win rate permanece uma métrica de validação, não o algoritmo do jogo.
