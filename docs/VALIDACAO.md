# Validação

Os testes exercitam o código real, não telas simuladas. As conexões chamadas de “humanas” nos testes automáticos são clientes de rede sintéticos, sem controlador IA do servidor. Isso valida protocolo e ocupação dos slots; não substitui sessões de usabilidade com pessoas.

## Observação local somente com bots — 25/09/2026

- A criação local oferece `Observador · Apenas bots`; o host não ocupa personagem e o servidor preenche 1 Troll × 5 Elfos com IA.
- O modo é recusado em salas públicas, privadas de rede e ranqueadas para evitar observação integral indevida.
- O observador recebe o mundo completo, alterna o personagem acompanhado com a hotkey de espectador e pode usar F10 para 1×/2×/4×/8× quando o servidor foi iniciado com `npm run start:dev`.
- `browser-lifecycle.js` validou interface, seis controladores IA, vitória natural, resultado, retorno ao mesmo lobby e revanche com outra seed, sem exceções JavaScript.

## Diretor estratégico e Balance Lab — 25/09/2026

- O Troll considera custo de viagem, custo de oportunidade das economias conhecidas e um Chase Budget de 4–20 segundos; nenhuma decisão consulta unidades ou estruturas ocultas.
- Após 90 segundos ativos sem progresso, o diretor troca prioridade para economia e reinicia exploração. Ele não concede atributos, recursos, posição inimiga ou condição de vitória.
- O Balance Lab passou a produzir score 0–100 e componentes de vitória, duração, resolução, early/long game e navegação. Há modos de ablação e perfis artificiais, sempre preservando 1×5.
- Amostra de segurança de 30 seeds: 17 Troll–13 Elfos, zero abertas, mediana 11:36, nenhuma abaixo de oito minutos e qualidade 90,5. Artefato: `artifacts/v2-strategic-director-corrected-30.json`.
- A primeira rodada de 100 foi rejeitada em 57–43. A causa foi isolada no Chase Budget curto; os atributos permaneceram intactos.
- Rodada aprovada, pareada com o baseline: 51 Troll–49 Elfos, 100/100 resolvidas, mediana 11:11, 4% abaixo de oito minutos e qualidade 91,7. Falhas médias de navegação 22,63 → 20,97; travamentos 31,13 → 25,79; exploração 10,26 → 8,44. Artefato: `artifacts/v2-strategic-director-calibrated-100.json`.
- O bloco estratégico foi aprovado, mas não fecha `GAME-116`: a mediana ainda não está na faixa de 13–15 minutos.

## Auditoria de progressão do GAME-116 — 25/09/2026

- A telemetria registra marcos Lendário/Épico, níveis finais do Troll e maior tier final por tipo de estrutura; o agregador apresenta frequência, média, mediana, P10 e P90.
- A amostra de referência para o diagnóstico terminou 12 Troll–18 Elfos, mediana 11:03 e zero abertas. A Espada surgiu em 27/30 partidas, mediana ativa 5:02; estruturas Lendárias élficas surgiram em 5/30, mediana ativa 18:37.
- Curva contínua, limiares 4/6, piso de recuperação, teto de ameaça e bônus de cerco Lendário foram testados isoladamente e em combinação. Nenhum candidato preservou simultaneamente 45–55%, mediana 13–15 e zero partidas abertas.
- Todos os ajustes de gameplay dessa exploração foram rejeitados. O baseline oficial permanece `wall-tier2-final-patrol-100.json`; somente a instrumentação de progressão foi incorporada.

## IA de abertura e baseline 1×5 Normal — 25/09/2026

- Bots evoluem a Barricada para nível 2 antes de Núcleo 2/Mina; sob pressão, uma evolução viável não é sufocada por reparo ordinário.
- Bots não iniciam Torres novas enquanto enxergam o Troll, eliminando o loop de centenas de reconstruções durante um único cerco.
- O Troll reinicia a patrulha de marcos públicos quando toda a fronteira já foi explorada; `SIM-1` deixou de ficar 925 segundos sem combate e terminou aos 27:48.
- Descoberta visual de uma base concede 75 de ouro, promovendo exploração sem buff de combate ou atributo temporal.
- Baseline final: 100 partidas 1×5 Normal, 47 Troll–53 Elfos, zero abertas, mediana 11:11, P90 22:06 e uma partida abaixo de quatro minutos. Artefato: `artifacts/wall-tier2-final-patrol-100.json`.
- `scripts/arena.js` e `scripts/sensitivity.js` agora usam dificuldade Normal por padrão; outras dificuldades precisam ser solicitadas explicitamente.

## Sustain, progressão Lendária e UX de upgrades — 24/09/2026

Regra vigente: simulações de balanceamento usam exclusivamente o lobby padrão 1 Troll × 5 Elfos, dificuldade Normal. Matrizes antigas com outras composições são mantidas apenas como diagnóstico histórico.

- A câmera de acompanhamento mantém cerca de 5,69 m de altura relativa ao alvo em qualquer nível de zoom; a roda altera somente a distância horizontal. A visão tática continua usando sua câmera elevada independente.
- `npm run start:dev` inicia o servidor local com o menu F10, concessão de recursos, debug de combate e velocidades 1×/2×/4×/8×. `npm start` mantém as ferramentas desativadas.

- 120 testes de regras, física, IA e rede aprovados; 61 arquivos JavaScript passaram em `node --check`.
- Fluxos reais de navegador aprovados para upgrade por Q, custo insuficiente em vermelho, Torre padrão sem especializações, upgrade sem cancelamento, stun, placar/MVP, PT-BR/EN e preferências.
- Cura do Troll: duas cargas, 20% do HP máximo em 6 segundos, cooldown de 75 s e uma carga recuperada a cada 180 s. Dano não interrompe o efeito.
- Regeneração: 0,10% do HP máximo/s em combate e 0,30%/s após quatro segundos sem dano; Vigor escala ambas e tem limite 10.
- A antiga fome foi removida: inatividade não causa dano, não bloqueia regeneração e não pode matar o Troll. A IA ainda recebe pressão comportamental para voltar ao combate.
- O Santuário na base do Troll acrescenta 0,50% do HP máximo/s após quatro segundos sem dano, além da regeneração normal.
- A IA usa a cura antes de abandonar uma pressão sustentável, reengaja perto de 58% e limita recuperação segura a 18 segundos.
- O simulador agora grava `Combat Time %`, `Retreat Time %`, duração média das retiradas, cura por consumível/regen, HP de retirada/reengage, estruturas destruídas e dano do Troll por minuto.
- O simulador de balanceamento usa por padrão o mesmo passo de 50 ms/20 Hz do servidor e seeds reproduzíveis no formato ranqueado `RANK-[A-F0-9]{16}`. O passo de 100 ms fica disponível somente para varreduras diagnósticas rápidas e não pode aprovar um baseline.
- Baseline atual após progressão 20 e IA econômica, 1×5 Normal a 20 Hz: 100 partidas concluídas, zero timeout, 50 vitórias Troll e 50 Elfos; média 9:55 e mediana 9:36. Quatro partidas terminaram em até seis minutos, 23 ficaram na janela de 12–18 minutos e as falhas médias de navegação caíram de 0,23 para 0,15. Artefato: `artifacts/usability-level20-balanced-1x5-100.json`.
- Experimento de ritmo rejeitado: reduzir simetricamente o dano básico para 70% elevou a mediana a 12:31 e colocou 62 partidas na faixa de 12–18 minutos, mas terminou 35–63 com dois jogos sem resolução em 20 minutos. Compensar a renda do Troll em 1,50× resolveu os impasses, porém inverteu para 69–31 e mediana 11:00. Os artefatos `combat-pace-v8-1x5-100.json` e `combat-pace-v8-gold150-1x5-100.json` ficam como diagnóstico; nenhum desses valores foi promovido. O próximo ajuste de duração deve evitar o limiar discreto de compras da IA e usar uma mudança estrutural de objetivos/ritmo.
- O lote dinâmico anterior de 300 partidas a 10 Hz fica preservado como histórico: 144 vitórias Troll e 156 Elfos (48%–52%); média 8:11 e mediana 8:16. Ele não é mais considerado baseline oficial porque as mesmas 100 seeds produziram apenas 71% de concordância de vencedor entre 10 Hz e 20 Hz.
- A meta vigente é 50% para cada lado, aceitando inicialmente 45–55% nas simulações. O ajuste 1×5 usa 1,10× de dano de cerco e fator 1,41 de recompensa-base.
- O Troll recebe por seed um setor inicial e sentido de patrulha. Os Elfos recebem rotação de perfis, preferência de refúgios e ordens distintas para posicionar Torres, Minas e Oficina. Em 300 partidas apareceram 24 patrulhas, 300 ordens de refúgio e 1.093 planos de construção distintos; repetir a seed preserva o mesmo resultado.
- O ciclo de fuga inicia os 18 segundos de recuperação apenas depois que o Troll realmente sai do fogo das Torres, evitando reentrada quase morto.
- Rodada histórica mista de 100 partidas: 100 concluídas, zero timeout, 11 vitórias Troll e 89 Elfos; média 7:54. Esse lote misturava quantidades de Elfos e dificuldades e não é mais aceito como baseline de balanceamento.
- Comparação histórica com a amostra imediatamente anterior de 24 seeds: taxa Troll 4,2% → 11%, duração média 9:30 → 7:54 e falhas médias de navegação 0,17 → 0,12. O resultado permanece útil como diagnóstico comportamental, não como referência de equilíbrio.
- Artefatos: `artifacts/usability-level20-balanced-1x5-100.json` é a referência atual; `artifacts/no-self-damage-100.json` e os lotes anteriores permanecem como comparações históricas.

## Candidata 0.2.0-alpha.2 — 24/09/2026

- 81 testes de regras, física, IA e rede aprovados.
- 52 arquivos JavaScript aprovados por `node --check`, incluindo a infraestrutura de release.
- `browser-review.js`: upgrade do Núcleo, atualização no mesmo tick, foco de seleção e ícones unificados.
- `browser-stun-scoreboard.js`: stun autoritativo, placar ao vivo, contador de reassentamento, MVP e tabela final, sem exceções JavaScript.
- `browser-i18n.js`: preferência persistente e troca ao vivo PT-BR/EN no menu, ajuda, lobby, HUD, seleção, loja e resultado, sem exceções JavaScript.
- `browser-accessibility.js`: escala de UI, redução de movimento, remapeamento persistente, execução do novo atalho dentro da partida e restauração dos padrões.
- `browser-review.js`: também confirma ausência do toast periódico de renda e o bloqueio explícito Núcleo 4 → Barricada 2, com liberação imediata quando a exigência é atendida.
- Estoque de árvores elevado para 1.000 madeiras, incluindo árvores ricas e rebrote. Em 100 partidas: 41 vitórias Troll, 59 Elfos, mediana 10:37 e nenhuma inconclusiva.
- Baseline anterior de 100 partidas: 49 vitórias Troll, 51 Elfos, média 14:38, mediana 14:46, nenhuma inconclusiva.
- Regressão de 60 partidas após stun/reassentamento: 33 vitórias Troll, 27 Elfos, média 14:58, mediana 15:50 e nenhuma inconclusiva. Foram usados 102 stuns em 45 partidas.
- `npm run verify` passa a ser o portão único local e de CI. A arena schema 2 registra versão, commit, dirty state e hash de configuração.

O baseline oficial versionado está em [`baselines/v0.2.0-alpha.2.json`](../baselines/v0.2.0-alpha.2.json). O histórico pareado de 100 seeds terminou 39–61. Após `GAME-111`, a matriz cruzada definitiva de 240 partidas terminou 105–135 (43,75%–56,25%), mediana 10:20, sem timeout ou partida inacabada. O cenário principal 1v5 normal compacto terminou 4–6. Detalhes e o resíduo 1v1 estão em [`RELATORIO-ETAPA-1.md`](RELATORIO-ETAPA-1.md).

A `alpha.2` remove o encerramento por relógio. O simulador usa um teto técnico configurável, atualmente 60 minutos, exclusivamente para detectar partidas sem resolução; esse teto e a matriz de cenários são gravados no artefato e não alteram a regra da partida.

### Modos de partida

`MODE-203` separa três contratos no servidor e na interface. **Normal** aplica o preset oficial sem MMR; **Personalizado** libera lobby, mapa, preparação e IA; **Ranqueado** força regras competitivas, sala pública e seed gerada pelo servidor. `MODE-204` acrescenta filas separadas de Troll e Elfo, grupos élficos de até cinco membros que nunca são divididos, composição autoritativa de 1 Troll e 5 Elfos, rendição após 10 minutos e revanche com os mesmos papéis. Durante o playtest sem população ativa, a fila inicia imediatamente e preenche as vagas restantes com bots; esta exceção fica marcada na sala e bots não podem ser adicionados manualmente. O Troll se rende sozinho; os Elfos precisam de 4/5 votos humanos, reduzidos à quantidade de Elfos humanos disponível no teste. Desconexões continuam sob controle temporário da IA. O MMR, colocações e divisões pertencem a `MODE-205`. Quick Play procura exclusivamente salas Normais.

## Estado atual — HUD e interação, 22/09/2026

- **45 testes de regras/rede aprovados.** Os dois cenários novos verificam cancelamento de investimentos: reembolso parcial calculado no servidor, ausência de duplicação, dono, proximidade, bloqueio após dano e proteção de obras já concluídas.
- Registro histórico: `browser-hud.js` validava formação por T, evolução, cancelamento de formação, E contextual, escolha de árvore, foco, teclado e layout. O roteiro foi migrado para Q e para upgrades comprometidos; cancelamento permanece apenas em formação/obra.
- Os roteiros de controles, progressão, construção, lobby/reconexão e revanche também passaram após a revisão. A revanche terminou com vitória natural aos 280 segundos de simulação.
- A construção agora encerra o projeto por padrão. O roteiro de construção foi atualizado para verificar isso e fechar seleção pelo botão próprio; pressionar Esc quando já não existe um projeto abre corretamente o menu. O roteiro de progressão agora expande a lista opcional de árvores antes de usá-la.
- Capturas inspecionadas: `hud-wisp-visible.png`, `hud-1280.png`, `wisp-economy.png`, `troll-arsenal.png`. Wisps têm modelo luminoso fora do tronco, rastro e identificação própria; foram verificados visualmente no cenário.

Fluxos, decisões de interface, referências e limites: [HUD-E-INTERACAO.md](HUD-E-INTERACAO.md). As evidências de balanceamento abaixo pertencem à entrega anterior; esta revisão não mudou as curvas de progressão.

## Entrega anterior — Wisps, loja e progressão infinita, 22/09/2026

- **43 testes de regras/rede aprovados.** Incluem as 32 verificações anteriores e 11 cenários de progressão, trabalhadores, compras e combate. Upgrades além do antigo limite são comprados com custos reais; valores em nível 1.000 são verificados contra overflow e intervalos impraticáveis.
- **Cinco roteiros de navegador aprovados**, sem exceções JavaScript. `browser-check`, `browser-gameplay`, `browser-lifecycle`, `browser-controls` e `browser-progression` cobrem os fluxos descritos abaixo. A revanche encerrou naturalmente em 280 segundos de simulação, com resultado nos dois clientes e nova seed.
- **72 partidas no lote final:** 38 vitórias do Troll, 32 dos Elfos e duas sem vencedor até 25 min. Mediana das concluídas: 420,5 segundos; oito partidas na meta de 12–18 min. O comando da auditoria retorna código 1 pelas duas inconclusivas; isso é registrado como limitação, não como aprovação total do lote.
- Mais **72 partidas da iteração intermediária** ficaram preservadas. O relatório final é `progression-infinite-final-20hz.json`; a comparação atual está em `progression-infinite-comparison.json`. Os três lotes anteriores e sua comparação foram preservados separadamente.
- **126 fixtures de combate** regeneradas com preparação e combo, sem itens. Na arena de cinco Rupturas tier IV com oficina IV, Troll nível IV morreu em 13,2 s só com leves e rompeu em 14,55 s com pesado/rugido, restando 12,5% de vida. Não é uma previsão de combate em uma clareira real.
- A janela das cinco seeds do teste de simulação foi ampliada de 20 para 30 min: SIM-2 terminou perto de 28:26. Não se exige mais que essas cinco seeds produzam ambos os vencedores; uma regra determinística testa vitória dos Elfos por dano real de torres. A mudança valida encerramento sem esconder que o ritmo desejado ainda falha.
- Servidor local recarregado apenas quando estava sem salas ativas. Menu e fluxo com dois clientes verificados depois da recarga.

Regras, builds, decisões, dados por grupo e limitações: [PROGRESSAO-INFINITA-E-COMBATE.md](PROGRESSAO-INFINITA-E-COMBATE.md). As seções datadas posteriores neste arquivo preservam resultados das versões anteriores.

## Cenários A–G

| Cenário | Cobertura implementada |
|---|---|
| A: humano Troll × 5 bots | WebSocket, criação, Ready obrigatório, mapa e seis personagens |
| B: humano Elfo + 4 bots × Troll bot | Mesma simulação, movimento via rede, rejeição de recursos falsificados |
| C: Troll humano × 2 Elfos humanos | Três conexões independentes, slots e mapa/seed idênticos |
| D: Troll humano × 3 humanos + 3 bots | Quatro conexões independentes, substituição de bots e papéis corretos |
| E: todos bots | Simulação completa até vitória, dano, renda, melhorias e ruptura de base |
| F: desconexão | Host migrado, IA no mesmo personagem, retomada por token e recursos preservados |
| G: resultado → lobby → revanche | Resultado igual nos clientes, Ready reiniciado, sessão mantida e nova seed |

Testes de regras adicionais cobrem: 40 seeds em dois tamanhos de mapa; recusa de entrada alternativa; A*; colisão; construção progressiva; coleta e esgotamento; cooldown; reparo com custo; overkill; fog; transferência de recursos; protótipos maliciosos; vitória dos dois lados; limite de acesso HTTP.

## Navegador

`scripts/browser-check.js` conecta a uma sessão Chrome isolada via CDP e cria dois contextos independentes. Verifica menu, sala privada, convite por código, ocupação de slot, Ready, início, HUD de cada papel, ghost, nove equipamentos, oito atributos do Troll, ajuda e recarga com reconexão. Captura exceções reais de JavaScript.

`scripts/browser-gameplay.js` inicia um servidor isolado, usa teclas WASD para percorrer uma rota física e confirma construções pela interface. Verifica núcleo concluído, coleta com E, barricada no portão e torre concluída, com custos e renda reais. Não teleporta o personagem, não concede ouro e não chama funções de construção diretamente.

`scripts/browser-lifecycle.js` verifica dois observadores conectados a uma partida inteiramente controlada por bots. A simulação real é acelerada somente no servidor isolado de teste, sem alterar HP, recursos ou condição de vitória. Confere o resultado nos dois navegadores, o retorno ao mesmo lobby, a limpeza do Ready e o início da revanche com outra seed.

`scripts/browser-controls.js` usa três navegadores conectados a um servidor isolado. Verifica Pointer Lock real, direção do mouse, mira, botão central, mapa clicável, bloqueio de movimento durante observação, retorno com C, pings entre aliados e isolamento do adversário, alertas clicáveis, teclas visíveis e liberação do cursor ao abrir loja/ajuda. Fixtures de combate são criadas apenas nesse servidor para provocar lentidão, dano e torre sob rugido de maneira determinística; os efeitos atravessam o snapshot real, sem substituir DOM ou protocolo.

`scripts/browser-progression.js` cria dois clientes e um servidor isolado. Fixtures concedem recursos e posições somente nesse processo para alcançar os cenários rapidamente; compras, upgrades, formação/transferência de Wisp e ataques são realizados pela interface e pelo protocolo real. Verifica três itens equipados, coleção, upgrades além do teto anterior, renda/fog de Wisp, evolução, troca de árvore, ruptura confirmada e cancelamento de pesado por esquiva. Capturas: `troll-arsenal.png`, `infinite-upgrades.png`, `wisp-economy.png`, `wall-breach.png`. Não mede latência de internet nem usabilidade humana.

Exemplo, com uma sessão de teste própria:

```powershell
npx agent-browser --session thornhold-check open http://localhost:3000
npx agent-browser --session thornhold-check get cdp-url
# Use o endereço retornado nos dois comandos:
node scripts/browser-check.js "ws://127.0.0.1:PORT/devtools/browser/ID"
node scripts/browser-gameplay.js "ws://127.0.0.1:PORT/devtools/browser/ID"
node scripts/browser-lifecycle.js "ws://127.0.0.1:PORT/devtools/browser/ID"
node scripts/browser-controls.js "ws://127.0.0.1:PORT/devtools/browser/ID"
node scripts/browser-progression.js "ws://127.0.0.1:PORT/devtools/browser/ID"
node scripts/browser-hud.js "ws://127.0.0.1:PORT/devtools/browser/ID"
npx agent-browser --session thornhold-check close
```

Relatórios e capturas ficam em `artifacts/`. Os scripts fecham somente seus contextos de teste. A renderização usa câmera com colisão contra as rochas e copas, e pode aproximar a câmera em passagens estreitas.

## Atualização de controles e IA — 21/09/2026

- 30 testes de regras/rede, incluindo pings, efeitos, isolamento da visão, navegação sem estruturas ocultas, retirada, perseguição e orientação da mira.
- 72/72 partidas da nova IA concluídas em `artifacts/tactical-ai-simulations.json`, sem modificar `shared/config.js`. Maior duração: 1.185 segundos.
- Nas mesmas 72 seeds do relatório anterior: vitórias do Troll passaram de 35 para 50; média de bases rompidas de 3,25 para 3,88. Isso mede mudança do comportamento dos bots, não equilíbrio entre jogadores humanos.
- Os quatro roteiros de navegador passaram sem exceções JavaScript. A partida autônoma do roteiro de revanche terminou em 283 segundos.
- Capturas: `mouse-look.png`, `status-effects.png`, `tactical-map.png`, `ally-alert.png`; relatórios individuais em `artifacts/`.

## Evidência anterior à atualização

- 21 testes de regras e rede aprovados.
- 240/240 partidas do lote terminaram; todas tiveram dano do Troll e produção econômica. A maior duração foi 965 segundos de simulação.
- Os três roteiros de navegador passaram sem exceções de JavaScript.
- O roteiro completo terminou com vitória natural do Troll em 306 segundos de simulação e iniciou a revanche nos dois clientes.
- No lote, o Troll venceu 20% das partidas 1v8 em dificuldade normal, frente a 80% em 1v2 normal. O tamanho de lobby ainda demanda ajuste de balanceamento; os resultados não são apresentados como equilíbrio final.

## Interpretação do balanceamento

`balance.json` é uma referência analítica: duas Balistas e ataque leve sustentado. Os níveis do Troll são explícitos, incluindo níveis 4, 6 e 10; a fase de cerco inclui seu bônus. Não inclui itens, combo, reparo, golpe pesado, rugido nem escalada por exposição. O retorno econômico considera ouro; madeira e tempo de obra são custos adicionais. Não é uma previsão exata da duração de combate em movimento.

`simulations.json` contém partidas completas do lobby padrão 1×5 Normal. O simulador usa 50 ms por padrão, igual ao servidor; 100 ms deve ser solicitado explicitamente e serve apenas para diagnóstico rápido. Mesmo com paridade de tick, bots não demonstram equilíbrio competitivo humano. Playtests humanos, latência real entre cidades e testes de carga prolongados continuam necessários antes de tratar o slice como lançamento de produção.

## Auditoria de progressão — 22/09/2026

- **32 testes aprovados.** Dois novos testes falharam antes da correção e passam depois: fome não renova ameaça/exposição/alerta de ataque; Troll faminto consegue abandonar recuperação segura, mantendo reação a acertos reais.
- **216 partidas** em três lotes de 72, a 20 Hz, com seeds pareadas e dificuldade separada por papel. Baseline: 58 vitórias Troll e 14 Elfos. Corrigido: 68 Troll, 3 Elfos, 1 sem vencedor até 25 min. Experimento de cronômetros: 72 Troll. A partida inconclusiva é uma limitação real e não é contada como derrota.
- O experimento `--timers-only` alterou final para 10:00 e fome para 15:00 apenas no processo de auditoria. Foi rejeitado: mediana de 10:55, compras concentradas no desbloqueio e nenhuma vitória dos bots Elfos nesse lote. O servidor mantém os cronômetros anteriores.
- **126 cenários de combate** em `combat-audit.json`, com implementação real de dano, reparo e habilidades. São fixtures de arena sem obstáculos, com estruturas pré-construídas e atributos fixos. Não validam colocação de estruturas nem representam uma partida real.
- `progression-comparison.json` recalcula medianas a partir das linhas de partidas, valida pareamento e separa partidas inconclusivas. Os primeiros dois relatórios brutos usam uma versão anterior do resumo que escolhia o valor central superior para grupos pares; para medianas consolidadas, usar a comparação.
- Após recarregar o servidor sem salas ativas, `browser-check.js` passou: menu, sala privada, dois clientes, Ready, HUDs, projeto, loja, ajuda e reconexão; nenhuma exceção JavaScript. A sessão isolada do navegador foi fechada.

Diagnóstico, fontes, metas de fases, comandos e trabalho restante: [BALANCEAMENTO-E-PROGRESSAO.md](BALANCEAMENTO-E-PROGRESSAO.md). A meta de 12–18 minutos não está validada como comportamento atual.

## Barricadas com durabilidade dobrada — 25/09/2026

- O HP base da Barricada passou de 1.155 para 2.310. A progressão até o nível 20 e o multiplicador Lendário continuam usando a mesma fórmula, agora sobre a nova base.
- Os testes direcionados de progressão, regras centrais e IA tática passaram: 87/87.
- A rodada pareada de 100 partidas 1×5 Normal terminou em 47 vitórias do Troll, 47 dos Elfos e 6 partidas ainda ativas aos 30 minutos. Entre as partidas concluídas, o resultado foi exatamente 50–50.
- A mediana subiu de 11:11 para 15:34; 8 partidas terminaram abaixo de 10 minutos, contra 36 no baseline; 18% ultrapassaram 25 minutos.
- O sucesso dos cercos caiu de 51,54% para 33,28%. As falhas médias de navegação subiram de 20,97 para 47,55, principalmente pelo aumento de tentativas do Troll ao redor de cercos prolongados.
- A mudança atende à faixa desejada de duração, mas ainda não é um baseline aprovado: seis partidas não resolveram e a navegação regrediu. O estado fica preservado como decisão explícita de balanceamento para a próxima correção de IA.

Artefato: `artifacts/barricade-double-hp-100.json`.
