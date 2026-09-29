# Revisão dos sistemas atuais

Estado revisado em 26/09/2026, release `0.3.0-alpha.1`, Balance 15 e AI 8.

Esta revisão não usa taxa de vitória de simulações como critério. O próximo ciclo de balanceamento deve partir de partidas completas observadas e da telemetria dessas partidas.

## Núcleo ativo do jogo

Estes sistemas participam de uma partida normal e devem ser preservados:

- servidor autoritativo, salas WebSocket, reconexão e takeover por bot;
- lobby padrão 1 Troll × 5 Elfos, bots com personalidades e rotas variadas pela seed;
- mapa procedural com 12 clareiras, terreno, trilhas, portão único e fog of war;
- construção, economia, Wisps, reassentamento, Espíritos e stun defensivo;
- combate do Troll, cura, esquiva, rugido, exposição às Torres e retorno ao Santuário;
- Forja Ancestral física, equipamentos e árvore de crescimento do Troll;
- Troll Level, XP e Cards, com escolhas adiadas quando o Troll está em combate;
- caminhos élficos Economia, Defesa e Tecnologia, Essência, níveis Lendário e Épico;
- placar ao vivo, MVP, limite de 60 minutos por pontos e resultado detalhado;
- IA estratégica V2: memória de setores, `PROBE`, cercos, reposicionamento, retirada, recuperação, adaptação de estratégia e Siege Parity;
- telemetria de economia, pressão, cercos, navegação, checkpoints e estado final.

## Sistemas ativos, porém pouco legíveis

O código os executa, mas o jogador dificilmente entende sua influência:

- Threat Income e recompensa escalável do Troll;
- Siege Parity usado na escolha de fortalezas pela IA;
- bônus e custos avançados dos três caminhos élficos;
- condições exatas para Espada Lendária e Torre Lendária;
- orçamento de perseguição, memória de cercos fracassados e troca de estratégia do Troll bot;
- pontuação que decide a partida aos 60 minutos.

Antes de criar novos sistemas, a interface deve explicar os que afetam decisões humanas: origem da renda, condição lendária e composição do placar.

## Implementado, mas desligado ou incompleto

### Especializações de Torre

Balista, Rajada, Gelo e Ruptura continuam definidas e possuem suporte de combate, mas `tower.specializations` está desligado. Toda Torre usa o perfil padrão. Manter quatro ramos invisíveis aumenta o custo mental e de manutenção sem criar escolha real.

Decisão recomendada: manter apenas o perfil padrão durante o alpha e mover os ramos para um documento de design; reintroduzir somente com UI, counterplay e playtest próprios.

### Ranqueado

A fila, grupo, preset 1×5, rendição e preenchimento temporário com bots existem. MMR, histórico persistente, temporadas e leaderboard persistente não existem. Portanto o modo é um playtest de fila competitiva, não um produto ranqueado completo.

### Pontos de interesse do mapa

Pedras ancestrais e Fonte do luar são somente marcos visuais. Não têm objetivo, recurso ou decisão associada. Isso é aceitável como orientação espacial, mas não devem ser apresentados como mecânica.

## Código e superfícies obsoletas encontradas

- `matchSeconds` declarava 20 minutos, mas o runtime usa exclusivamente `matchHardLimit` de 60 minutos. A chave morta foi removida.
- O menu de controles ainda exibia `E — Interagir / coletar`, embora a ação contextual tenha sido consolidada em `R`. O binding morto foi removido da interface.
- Documentação ainda dizia loja em `B`, cinco Torres e ausência de limite de tempo. Foi corrigida para Forja em `G`, retorno em `B`, duas Torres e 60 minutos.
- Scripts antigos de navegador ainda carregam fluxos históricos com `E`. Eles não entram no runtime nem em `npm test`, mas devem ser revisados antes de voltar ao pipeline principal.
- Pressão de Cerco, seus stacks, multiplicador de dano, penalidade de reparo, configuração e UI foram removidos. Siege Parity e o bônus explícito de final de partida permanecem sistemas separados.

## Complexidade que merece redução

`client/main.js`, `shared/simulation.js` e `shared/troll-brain.js` concentram muitas responsabilidades. Isso não significa que testes deixem o jogo lento: testes não rodam dentro da partida. O risco real é regressão e dificuldade de alterar regras.

Próxima separação recomendada, sem mudar gameplay:

1. extrair HUD, modais e atalhos de `client/main.js`;
2. extrair combate, economia, construção e fim de partida de `shared/simulation.js`;
3. separar percepção, decisão estratégica e execução tática de `shared/troll-brain.js`;
4. manter uma única fonte de verdade para regras exibidas no README e HUD;
5. classificar testes de navegador em críticos, diagnósticos e históricos.

## Próximo playtest recomendado

Observar uma partida completa 1×5 normal com a nova Forja e registrar:

- primeiro retorno do Troll e tempo gasto fora da pressão;
- ouro carregado ao voltar e compras feitas por visita;
- primeira Barricada rompida e primeira morte de Elfo;
- se o Troll retorna por decisão econômica ou apenas quando está ferido;
- diferença entre Gold ganho e Gold efetivamente investido;
- tempo do último Elfo sozinho;
- resultado e placar aos 60 minutos, se houver.

Não alterar dano, HP, renda ou curvas antes desse playtest. A Forja já muda o ritmo do early game ao transformar compras instantâneas em uma decisão de rotação com custo de tempo.
