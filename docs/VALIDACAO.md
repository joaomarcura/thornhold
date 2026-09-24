# Validação

Os testes exercitam o código real, não telas simuladas. As conexões chamadas de “humanas” nos testes automáticos são clientes de rede sintéticos, sem controlador IA do servidor. Isso valida protocolo e ocupação dos slots; não substitui sessões de usabilidade com pessoas.

## Candidata 0.2.0-alpha.2 — 24/09/2026

- 81 testes de regras, física, IA e rede aprovados.
- 50 arquivos JavaScript aprovados por `node --check`, incluindo a infraestrutura de release.
- `browser-review.js`: upgrade do Núcleo, atualização no mesmo tick, foco de seleção e ícones unificados.
- `browser-stun-scoreboard.js`: stun autoritativo, placar ao vivo, contador de reassentamento, MVP e tabela final, sem exceções JavaScript.
- Baseline anterior de 100 partidas: 49 vitórias Troll, 51 Elfos, média 14:38, mediana 14:46, nenhuma inconclusiva.
- Regressão de 60 partidas após stun/reassentamento: 33 vitórias Troll, 27 Elfos, média 14:58, mediana 15:50 e nenhuma inconclusiva. Foram usados 102 stuns em 45 partidas.
- `npm run verify` passa a ser o portão único local e de CI. A arena schema 2 registra versão, commit, dirty state e hash de configuração.

O baseline oficial versionado está em [`baselines/v0.2.0-alpha.2.json`](../baselines/v0.2.0-alpha.2.json). O histórico pareado de 100 seeds terminou 39–61. Após `GAME-111`, a matriz cruzada definitiva de 240 partidas terminou 105–135 (43,75%–56,25%), mediana 10:20, sem timeout ou partida inacabada. O cenário principal 1v5 normal compacto terminou 4–6. Detalhes e o resíduo 1v1 estão em [`RELATORIO-ETAPA-1.md`](RELATORIO-ETAPA-1.md).

A `alpha.2` remove o encerramento por relógio. O simulador usa um teto técnico configurável, atualmente 60 minutos, exclusivamente para detectar partidas sem resolução; esse teto e a matriz de cenários são gravados no artefato e não alteram a regra da partida.

### Modos de partida

`MODE-203` separa três contratos no servidor e na interface. **Normal** aplica o preset oficial sem MMR; **Personalizado** libera lobby, mapa, preparação e IA; **Ranqueado** força regras competitivas, sala pública e seed gerada pelo servidor. O MMR ainda não é gravado: filas, grupos e elegibilidade pertencem a `MODE-204`, enquanto colocações e divisões pertencem a `MODE-205`. Quick Play procura exclusivamente salas Normais. O navegador automatizado valida a presença dos três modos, o bloqueio do preset Normal, o desbloqueio do Personalizado e o início real da partida.

## Estado atual — HUD e interação, 22/09/2026

- **45 testes de regras/rede aprovados.** Os dois cenários novos verificam cancelamento de investimentos: reembolso parcial calculado no servidor, ausência de duplicação, dono, proximidade, bloqueio após dano e proteção de obras já concluídas.
- `browser-hud.js` passou com formação por T, evolução por U, cancelamento, E contextual, escolha de árvore no cenário, clique no marcador do Wisp, Esc sem desfazer compra, foco preservado, Tab, botão direito, interrupção de tecla mantida, repetição por Shift, dicas opcionais e layout em 1280×720. Sem exceções JavaScript.
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

`simulations.json` contém partidas completas e agrupamento por quantidade de Elfos/dificuldade. Os bots usam passo de 100 ms para execução em lote; o servidor real usa 50 ms. Tendências do lote orientam ajustes, mas não demonstram equilíbrio competitivo. Playtests humanos, latência real entre cidades e testes de carga prolongados continuam necessários antes de tratar o slice como lançamento de produção.

## Auditoria de progressão — 22/09/2026

- **32 testes aprovados.** Dois novos testes falharam antes da correção e passam depois: fome não renova ameaça/exposição/alerta de ataque; Troll faminto consegue abandonar recuperação segura, mantendo reação a acertos reais.
- **216 partidas** em três lotes de 72, a 20 Hz, com seeds pareadas e dificuldade separada por papel. Baseline: 58 vitórias Troll e 14 Elfos. Corrigido: 68 Troll, 3 Elfos, 1 sem vencedor até 25 min. Experimento de cronômetros: 72 Troll. A partida inconclusiva é uma limitação real e não é contada como derrota.
- O experimento `--timers-only` alterou final para 10:00 e fome para 15:00 apenas no processo de auditoria. Foi rejeitado: mediana de 10:55, compras concentradas no desbloqueio e nenhuma vitória dos bots Elfos nesse lote. O servidor mantém os cronômetros anteriores.
- **126 cenários de combate** em `combat-audit.json`, com implementação real de dano, reparo e habilidades. São fixtures de arena sem obstáculos, com estruturas pré-construídas e atributos fixos. Não validam colocação de estruturas nem representam uma partida real.
- `progression-comparison.json` recalcula medianas a partir das linhas de partidas, valida pareamento e separa partidas inconclusivas. Os primeiros dois relatórios brutos usam uma versão anterior do resumo que escolhia o valor central superior para grupos pares; para medianas consolidadas, usar a comparação.
- Após recarregar o servidor sem salas ativas, `browser-check.js` passou: menu, sala privada, dois clientes, Ready, HUDs, projeto, loja, ajuda e reconexão; nenhuma exceção JavaScript. A sessão isolada do navegador foi fechada.

Diagnóstico, fontes, metas de fases, comandos e trabalho restante: [BALANCEAMENTO-E-PROGRESSAO.md](BALANCEAMENTO-E-PROGRESSAO.md). A meta de 12–18 minutos não está validada como comportamento atual.
