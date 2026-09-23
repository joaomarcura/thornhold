# Reconstrução do mapa da caçada

Implementado em 23/09/2026. O objetivo é recuperar a escolha de esconderijo, a descoberta pelo Troll e a defesa de um acesso estreito, com relevo realmente integrado à movimentação.

## Referências e limites da reconstrução

- [Troll vs. Elves v4.7 B5.5 — HIVE](https://www.hiveworkshop.com/threads/troll-vs-elves-v4-7-b5-5.207999/): publicação do mantenedor, com guia e capturas. Documenta muitos esconderijos, saída dos Elfos antes do Troll e procura ativa pelas bases. Fundamenta a sequência fugir → escolher refúgio → bloquear entrada → sustentar o cerco.
- [Guia de Troll & Elves de 2010](https://sigcrysis.blogspot.com/2010/12/warcraft-iii-troll-elves-how-to-play.html): relato de jogador sobre espaço para construção, quantidade de entradas, bases compartilhadas e necessidade de preservar árvores para Wisps. Também explicita que o Troll precisa encontrar os Elfos. É uma referência histórica de experiência, não uma especificação oficial de todas as versões.
- [Troll and Elves 7.9'8 — XGM](https://xgm.guru/p/wc3/Troll-and-Elves-798-SmI): publicação do autor dessa variante com discussão de regiões e anexos de bases. Confirma que a organização espacial mudou entre forks. Seus números e regras não foram transferidos para Thornhold.

As páginas e os guias foram consultados. As imagens antigas foram localizadas, mas a navegação externa das ferramentas de navegador falhou; não foram tratadas como uma planta completa inspecionada. Não foi identificado qual versão exata o usuário jogava, nem extraído seu arquivo de terreno. Portanto, esta é uma reconstrução da experiência descrita, com geometria própria, e não uma réplica certificada de um mapa específico. A névoa do minimapa e as rampas desta versão são decisões de adaptação.

## Resultado implementado

| Aspecto | Antes | Agora |
| --- | --- | --- |
| Refúgios | Oito espaços praticamente iguais | Doze opções para até oito Elfos; sempre sobram esconderijos possíveis |
| Capacidade | Mesmo desenho e estoque | Recanto: 5 árvores/750 madeira; bosque: 8/1.440; clareira ampla: 12/2.520 |
| Terreno | Piso plano | Platôs e baixadas, entre −4,4 m e +5,4 m; interiores planos para construir |
| Rotas | Vias radiais visuais, inclusive através de obstáculos | Trilhas navegáveis com voltas, bifurcações, circuitos e ramais sem saída |
| Busca | Terreno inteiro exposto no minimapa | Revelação por visão real da equipe e memória do terreno explorado |
| Recursos expostos | Distribuição aleatória | Bosques ricos nas aproximações; estoque de 300 por árvore e risco de exposição |
| Câmera e interação | Seleção sobre plano y=0 | Personagens, construções, efeitos, cursor e câmera usam a mesma altura |

Cada clareira conserva uma única entrada terrestre. A distribuição dos três tamanhos e dos recursos varia com a seed. O mapa compacto tem 109 × 109 células e o amplo 125 × 125, com 2,2 m por célula. A floresta ocupa células bloqueadas: o cenário não coloca troncos sólidos no meio de uma trilha navegável. As árvores coletáveis preservam a regra anterior de interação.

O relevo usa uma superfície contínua de triângulos compartilhada entre servidor e renderização. A movimentação mantém subpassos de até 30 cm, rejeita inclinação excessiva e conserva as colisões de unidades e estruturas. Fundações exigem terreno plano. A linha de visão considera floresta e elevações intermediárias. O círculo das torres acompanha o chão e considera o alcance da especialização.

Os bots Elfos escolhem entre os doze refúgios em uma ordem determinada pela seed. O Troll continua explorando pela visão e pelas observações anteriores; após recuar, evita temporariamente aquele cerco para procurar outra região.

## Verificação e evidências

- `npm test`: **49/49**. Inclui regras, economia, combate, WebSocket, entradas únicas, plataformas planas e neblina de exploração.
- Foram gerados **200 mapas** em dois tamanhos para verificar conectividade, portões e fundações planas.
- O teste de deslocamento percorre ida e volta dos doze refúgios, com Elfo e Troll, em três seeds e dois tamanhos: **288 travessias de sentido único**, usando a movimentação real do servidor.
- `node scripts/browser-terrain.js`: servidor e Chrome isolados; caminhada por teclado, subida a +3,6 m, descida a −3,6 m, retorno e construção de núcleo, muro e torre pela interface. Nenhum erro JavaScript. Erro máximo entre altura física e interseção do chão: aproximadamente **0,0000002 m**.
- `node scripts/simulate.js 24 artifacts/terrain-simulations.json`: **24/24 partidas encerradas** em até 20 minutos. Os resultados são simulações de bots e não validam equilíbrio entre jogadores humanos.

Os testes de vitória agora aceitam uma defesa dos Elfos que encerre a partida sem perder uma base; o teste de ruptura continua cobrindo destruição e liberação da entrada. A sincronização de resultado em rede exige dano real dos dois lados e permite o mesmo teto de simulação do teste de ciclo completo.

Arquivos de evidência: `artifacts/browser-terrain.json`, `artifacts/terrain-tests.log`, `artifacts/terrain-simulations.json` e capturas `terrain-overview.png`, `terrain-plateau.png`, `terrain-lowland.png`, `terrain-explored-map.png`.

## Próximo ajuste identificado

O lote de bots favoreceu os Elfos. A ampliação do mapa dá mais tempo para a economia defensiva; o próximo ajuste de equilíbrio deve medir primeiro encontro, distância percorrida, tempo de cerco e resultados humanos antes de alterar atributos. Bases compartilhadas, múltiplas entradas, teleporte e travessia aérea continuam fora desta mudança.
