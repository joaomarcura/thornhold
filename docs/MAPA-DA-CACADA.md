# Reconstrução do mapa da caçada

## Atualização 0.6.4-alpha.1 — pesca autoritativa (03/10/2026)

Primeiro ciclo jogável: construa um Núcleo, encontre **Praia · pesca** no mapa M, aproxime-se e olhe para o mar. **P** equipa/guarda a vara inicial gratuita. Clique esquerdo lança; clique novamente após o som e a boia afundar. A disputa é automática. **I** abre inventário/coleção. Atalhos podem ser remapeados nas configurações. Movimentar-se, sofrer dano, ser atordoado ou iniciar outra ação interrompe. Esc e botão direito cancelam. R permite retornar à coleta/reparo. A captura mostra o peixe em 3D e um resumo pequeno, sem liberar o mouse ou bloquear controles.

Cinco espécies, seis raridades e Shiny independente. Tamanho, peso e idade são correlacionados; rating mede porte/condição dentro da espécie, não raridade. Inventário limitado a 60 peixes, perdido ao morrer. Coleção visual salva na conta autenticada (SQLite); visitantes salvam somente neste navegador. Não há transferência de peixes vendáveis ou ouro entre partidas. Registros são escritos a partir da captura autoritativa, fora do tick de física; a API da coleção é somente leitura e exige login.

Vara, linha, boia e disputa amostram fase/timestamps do servidor, no relógio global de 1,25× e DEV. Cinco silhuetas reutilizam geometria; linha e flexão da vara atualizam buffers existentes. Sem peixes simulados no oceano inteiro, novas luzes, reflexos ou sombras. Apresentação pré-compilada assincronamente. O inventário não é retransmitido nos deltas de movimento. Medição mantém CPU de pesca separado dos custos existentes de GPU/cena/sombras/snapshots/HUD, sem reduzir DPR ou esconder quedas de FPS.

**Escopo deste protótipo:** valor de venda é apenas estimativa; pesca ainda não concede ouro. Oficina de venda, aprimoramentos de vara, auto-upgrades, pesca dos bots e arma defensiva permanecem nas próximas etapas. Economia e inteligência dos bots não foram recalibradas. 144 FPS requer validação controlada no navegador do jogador; testes de geometria/custo não são garantia de FPS.

Validação: 358 testes da suíte rápida, incluindo o ciclo de captura pela conexão WebSocket real em sala 1×5, cancelamento, privacidade e persistência visual; verificação sintática de 123 arquivos JavaScript. Interface da vara e do inventário conferida com computer-use no localhost, sem erros de console. A captura completa na praia ainda precisa de playtest visual do jogador. A primeira sessão automatizada apresentou FPS baixo; após reiniciar, a preparação mostrou cerca de 142–144 FPS. Nenhuma dessas amostras substitui benchmark de pesca e combate em bases desenvolvidas, nem confirma 144 FPS sustentados. Servidor local reiniciado e arquivos servidos comparados por SHA-256 com o workspace.

## Atualização 0.6.3-alpha.1 — protótipo costeiro (02/10/2026)

Etapa 1 da pesca: as doze clareiras possuem uma faixa de areia na parte traseira, vista para o mar e um ponto preparado para pesca, indicado no mapa ampliado como **“Praia · pesca em breve”**. A faixa usa o terreno que já era transitável; os pontos respeitam a madeira coletável existente. O mar ocupa terreno externo bloqueado. Pedras baixas sinalizam o limite da praia. Bases elevadas conservam sua altura e formam terraços costeiros; não houve remodelagem física dos platôs.

O mapa passa à versão 6. Portões, rotas, colisões, alturas autoritativas, árvores, recursos e túneis co-op permanecem iguais. Não existe natação nem acesso traseiro para contornar uma barricada. A costa não consome RNG e, portanto, não altera a sequência de decisões dos bots. O minimapa mantém as regras de descoberta: praias de bases desconhecidas não são reveladas antecipadamente.

O mar é opaco, usa fog e não possui reflexos em tempo real, simulação de ondas ou partículas contínuas. São no máximo quatro batches estáticos adicionais, sem novas luzes ou sombras projetadas. O campo costeiro é calculado na carga do mapa, não durante ticks ou frames. A descarga de mapas também libera os buffers de instâncias na GPU. A ponte mantém 2,5 cm de afastamento visual do terreno, sem mudar a altura de navegação, para evitar superfícies coplanares.

Validação: 17 testes direcionados de costa/ambiente/terreno, 345 testes da suíte rápida e verificação sintática de 118 arquivos JavaScript aprovados. Partida de observação real 1×5 aberta no localhost; costa, mar e marcações conferidos, sem erros no console. **Desempenho de 144 FPS ainda não validado:** o navegador automatizado apresentou intervalos de aproximadamente 1 segundo entre frames apesar de custos de CPU/GPU na ordem de milissegundos. É necessária uma comparação controlada em primeiro plano; os testes de número de batches não substituem essa medição.

### Próxima etapa aprovada — ainda não implementada

Pesca, inventário de peixes, venda e evolução da vara serão implementados depois do protótipo costeiro. A renda da pesca complementará a economia atual. A nova Oficina será exclusiva dessa experiência, sem reativar funções antigas removidas.

**Morte do Elfo:** perde todos os peixes ainda não vendidos, inclusive ao reassentar. A coleção visual permanece entre partidas, mas não transfere peixes vendáveis nem ouro. A persistência dessa coleção ainda precisa ser implementada.

Auto-upgrades serão opcionais e pagos pelos custos normais do próprio jogador; escolhas de especialização e gastos de cristal permanecem manuais. A arma defensiva será uma etapa posterior.

## Atualização 0.6.2 — rio, pontes e arbustos (02/10/2026)

O mapa versão 5 possui um rio sinuoso também em partidas solo. A malha de apresentação forma um leito rebaixado; a água fica abaixo das margens. Pontes têm tábuas, corrimãos, postes e apoios. Seu piso cobre as células navegáveis existentes, na altura autoritativa original. Não foram alterados caminhos, plataformas, portões, túneis co-op, recursos ou linha de visão. Água fora das pontes continua não transitável; não existe natação nesta entrega.

Arbustos arredondados, samambaias, plantas com frutos e juncos usam geometria compartilhada e lotes estáticos, com limite de 180 plantas. A vegetação é decorativa, não madeira coletável. O rio usa uma superfície opaca, sem reflexos em tempo real, luzes adicionais ou partículas contínuas. Somente o lote de madeira das pontes acrescenta sombras projetadas. A nova apresentação participa da pré-compilação assíncrona.

O minimapa distingue água e piso das pontes conforme a visão/memória de terreno da equipe. Testes cobrem os três estilos, dois tamanhos e solo/co-op, sem simulações de balanceamento.

As seções abaixo são o histórico da reconstrução inicial.

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
| Capacidade | Mesmo desenho e estoque | Recanto: 5 árvores/5.000 madeira; bosque: 8/8.000; clareira ampla: 12/12.000 |
| Terreno | Piso plano | Platôs e baixadas, entre −4,4 m e +5,4 m; interiores planos para construir |
| Rotas | Vias radiais visuais, inclusive através de obstáculos | Trilhas navegáveis com voltas, bifurcações, circuitos e ramais sem saída |
| Busca | Terreno inteiro exposto no minimapa | Revelação por visão real da equipe e memória do terreno explorado |
| Recursos expostos | Distribuição aleatória | Bosques ricos nas aproximações; estoque de 1.000 por árvore e risco de exposição |
| Câmera e interação | Seleção sobre plano y=0 | Personagens, construções, efeitos, cursor e câmera usam a mesma altura |

Cada clareira conserva uma única entrada terrestre. A distribuição dos três tamanhos e dos recursos varia com a seed. Toda árvore coletável possui estoque de 1.000 madeiras; árvores ricas continuam diferenciadas pela velocidade de coleta, não pela reserva. O mapa compacto tem 109 × 109 células e o amplo 125 × 125, com 2,2 m por célula. A floresta ocupa células bloqueadas: o cenário não coloca troncos sólidos no meio de uma trilha navegável. As árvores coletáveis preservam a regra anterior de interação.

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
