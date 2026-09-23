# Referências do modo e decisões de implementação

Pesquisa em 21/09/2026. Existem versões diferentes de Troll and Elves; estas fontes descrevem suas próprias variantes, não um regulamento único.

## Fontes primárias

- [Troll & Elves 2, página do criador na Steam Workshop](https://steamcommunity.com/sharedfiles/filedetails/?id=687495832): economia passiva dos Elfos, entrada bloqueada por defesa resistente, torres contra o Troll, ouro do Troll por dano e cooperação por recursos/trabalho.
- [Troll vs. Elves v4.7 B5.5, apresentação e guia publicados pelo mantenedor no HIVE](https://www.hiveworkshop.com/threads/troll-vs-elves-v4-7-b5-5.207999/): o guia recomenda localizar os refúgios, usar ataques para financiar melhorias e voltar ao cerco com mais capacidade de sobrevivência. A regra social de preservar a muralha dessa variante não foi adotada: Thornhold tem ruptura e eliminação como objetivos explícitos.

## Tradução para Thornhold

As fontes orientam o ciclo de exploração, pressão econômica, compras e cerco. Os valores, modelos, mapa e código de Thornhold são próprios. Não foram acrescentados lobos, anjos ou a tenda do Troll dessas variantes nesta atualização.

`shared/troll-brain.js` implementa:

1. **Explorar:** só registrar inimigos dentro da visão real. Memórias de personagens expiram rápido; estruturas são mantidas por tempo limitado e removidas quando a posição é revisitada vazia. A navegação não usa estruturas ocultas para antecipar bloqueios.
2. **Escolher alvo:** considerar distância, vida observada, tempo estimado de destruição, pressão das torres e Elfos expostos. Manter o alvo por uma janela curta para evitar oscilações.
3. **Combater:** usar os mesmos ataques, compras, cooldowns e colisões dos humanos. Reservar rugido para torres próximas e esquiva para fuga ou perseguição.
4. **Recuar:** comparar vida, dano recente e pressão das torres conhecidas. Buscar um ponto alcançável com menor risco, em vez de sempre atravessar o mapa até o spawn.
5. **Recuperar e alternar:** esperar regeneração fora do fogo, dar um intervalo ao setor perigoso e procurar outra oportunidade. A aproximação da fome limita a espera.
6. **Comprar:** priorizar vida quando ferido, regeneração para novas investidas, armadura conforme as torres e capacidade de cerco para evoluir os ataques.

Não houve aumento de HP, dano, renda ou recursos dos bots. Dificuldade continua alterando decisões e tempo de reação. Essas heurísticas aproximam decisões comuns de jogadores; não foram treinadas com replays e não equivalem a um jogador competitivo experiente.

## Informação tática

Os mapas recebem apenas o snapshot autorizado pelo servidor. Alertas apontam o aliado/estrutura atingido, sem revelar coordenadas do atacante escondido. A última visão do Troll é uma posição congelada, distinguida por círculo tracejado, que desaparece após 12 segundos. Pings de perigo/ajuda/atenção são anotações dos jogadores; não concedem visão e não confirmam a presença de inimigos.

Os efeitos usam tempos absolutos do servidor. Reaplicar gelo renova a contagem; receber um ataque adia a regeneração. A exposição mostra o prazo estimado sem novos acertos. Fome e regeneração são condições contínuas e exibem a condição de encerramento ou a taxa, sem inventar uma duração fixa. Fome impede regeneração pela própria regra, mas não conta como ataque inimigo nem renova exposição ou alertas.

## Pesquisa e auditoria de progressão — 22/09/2026

A [auditoria de balanceamento](BALANCEAMENTO-E-PROGRESSAO.md) amplia as referências com Troll vs Elves 4 e notas dos criadores, compara o código com o ciclo das variantes e registra a meta escolhida de 12–18 minutos. Inclui 216 partidas simuladas, 126 cenários controlados e propostas priorizadas. Os sistemas propostos de habilidades do Elfo, pesquisas e objetivo final ainda não estão implementados.

## Wisps, equipamentos e combate — continuação de 22/09/2026

A [documentação oficial de Warcraft III](https://classic.battle.net/war3/nightelf/basics.shtml) descreve Wisps ligados a árvores, com coleta gradual que não destrói o tronco. Thornhold adota essa relação entre espaço, produção e vulnerabilidade, com valores próprios. As [notas do criador de Troll vs Elves 4](https://steamcommunity.com/sharedfiles/filedetails/changelog/2027812233?p=2) também registram evolução de Wisps e ajustes de itens; não são tratadas como uma regra universal para todas as variantes.

Os bots Elfos agora formam/evoluem Wisps, usam a quinta torre, mantêm reserva de madeira e recuam para dentro da base durante a proibição de reconstruir o portão. O Troll mantém o ataque entre decisões, monta uma das três builds com recursos reais e evita tratar um Wisp frágil como justificativa para mergulhar sob torres letais. Informações ocultas continuam fora da tomada de decisão.

Regras, limites e resultados novos estão em [PROGRESSAO-INFINITA-E-COMBATE.md](PROGRESSAO-INFINITA-E-COMBATE.md). Essa atualização inclui progressão contínua e equipamentos, mas ainda não implementa habilidades ativas do Elfo nem um objetivo final compartilhado.
