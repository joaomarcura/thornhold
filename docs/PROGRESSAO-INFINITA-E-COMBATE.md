# Progressão infinita, Wisps e combate

Implementação de 22/09/2026. A meta permanece **12–18 minutos, com fases claras**; os novos sistemas estão jogáveis, mas o ritmo ainda não atinge essa meta. Não foi acrescentada uma vitória por cronômetro para encerrar artificialmente as partidas.

## Como usar

- **Elfo:** construa e conclua o núcleo; pressione **N** perto dele. Forme Wisps, evolua os existentes ou selecione um para trocar sua árvore. O recurso madeira também abre esse painel.
- **Troll:** perto da Forja, **G** abre a loja com mouse livre. Equipamentos possuem quatro categorias — Capacete, Armadura, Arma e Botas — com cinco opções positivas em cada uma. A Árvore de crescimento fica em uma página separada; Cerco, Caçador e Sustentação são sugestões, sem impedir misturas.
- **Combate:** segure o clique para leves, **Q** para pesado, **Espaço** para esquiva e **F** para rugido. O terceiro leve consecutivo no mesmo alvo recebe bônus. Esquivar cancela a preparação e fortalece o próximo acerto por 1,2 segundo.

## Árvores como espaço econômico

Cada árvore viva recebe **um Wisp**, e cada Wisp produz continuamente sem consumir o estoque de coleta manual. Assim, poucas árvores limitam a quantidade de trabalhadores, mas não encerram a economia: evoluir um Wisp aumenta a renda no mesmo espaço. A alternativa é ocupar árvores externas, aceitando maior risco.

O núcleo forma um Wisp por vez, em seis segundos. O Elfo precisa estar vivo, perto do próprio núcleo concluído e com recursos. O custo depende dos Wisps vivos: `65 × 1,32^n` ouro e `15 × 1,15^n` madeira, arredondados. Perder um trabalhador reduz o custo da reposição; não há uma penalidade crescente baseada em todas as contratações anteriores.

| Escolha | Efeito implementado |
|---|---|
| Novo Wisp | 1,4 madeira/s no nível 1; ocupa uma árvore |
| Evolução | +25% de produção por nível; sem nível máximo; quatro segundos de melhoria |
| Preço da evolução | Primeiro upgrade: 70 ouro + 20 madeira; seguintes: ×1,5 ouro / ×1,3 madeira |
| Árvore externa | +60% de produção; deve estar visível e a até 25 m do núcleo |
| Trocar árvore | Seis segundos sem produzir; destino precisa estar livre e elegível |
| Núcleo destruído | Produção suspensa até existir núcleo concluído no alcance |
| Wisp destruído | Produção perdida; Troll recebe recompensa limitada, vinculada ao custo |

Um Wisp em melhoria continua produzindo no nível anterior. A coleta manual não pode remover sua árvore. Árvores esgotadas manualmente rebrotam em 35 segundos, aguardando se uma construção ocupar o local. A oficina continua melhorando **coleta manual e reparo**; a produção dos Wisps vem dos próprios níveis e da árvore escolhida.

A seleção automática prioriza a clareira. A formação e a transferência usam um vínculo mágico com atraso, sem caminho físico de trabalhador. Wisps inimigos só aparecem sob visão autorizada; aliados recebem alertas quando eles são atacados.

O vínculo que coleta sem destruir o tronco foi inspirado na [descrição oficial dos Elfos Noturnos de Warcraft III](https://classic.battle.net/war3/nightelf/basics.shtml). A economia, as curvas e o código aqui são próprios. As [notas do criador de Troll vs Elves 4](https://steamcommunity.com/sharedfiles/filedetails/changelog/2027812233?p=2) serviram como referência adicional de progressão, sem presumir que todas as versões usam as mesmas regras.

## Crescimento sem nível máximo

Estruturas, Wisps e os oito atributos do Troll continuam evoluindo sem bloqueio temporal. O Núcleo depende de uma Barricada concluída e viva na mesma base: níveis 2–3 exigem Barricada 1, níveis 4–5 exigem Barricada 2 e a progressão segue com `floor(nível-alvo / 2)`. Após o quarto tier, vida/renda/dano de torres crescem 18% por tier, com preços crescendo 35% em ouro e 25% em madeira. No Troll, dano cresce 12% e vida 14% por nível após o quarto; armadura, movimento e velocidade têm ganhos decrescentes.

Isso separa progressão contínua de velocidade sem controle: o intervalo de ataque não cai abaixo de 250 ms, e as janelas de preparação continuam existindo. Fórmulas saturam valores numéricos para evitar overflow; não há bloqueio comprável de nível. Modelos mantêm quatro estágios visuais, sem crescer indefinidamente e esconder o cenário.

As curvas ainda precisam de ajuste econômico. Por exemplo, o retorno marginal em ouro do núcleo IV→V é de aproximadamente 201 segundos; no X→XI, 450 segundos, sem contar madeira e tempo de obra. Evoluir sempre que houver dinheiro não é necessariamente a melhor decisão perto do fim de uma partida.

## Loja e escolhas do Troll

São nove itens em **arma, proteção e relíquia**, um equipado por espaço. Itens comprados ficam na coleção; reequipar é gratuito após cinco segundos sem causar/receber dano e sem golpe em preparação. Trocar vida máxima preserva a porcentagem atual, impedindo cura gratuita por troca de equipamento.

| Sugestão | Itens | Estratégia e custo da escolha |
|---|---|---|
| Cerco | Marreta de cerco, Couraça de pedra, Totem do silêncio | Romper defesa durante rugido; ataques e movimento mais lentos |
| Caçador | Garras da caça, Manto do vento, Selo da caça | Reposicionar e aproveitar abertura após esquiva; menos vida e dano a estruturas |
| Sustentação | Lâmina longa, Musgo vivo, Âmbar vampírico | Alcance, recuperação e roubo de vida por dano efetivo; musgo reduz armadura |

Itens custam entre 180 e 240 ouro. A loja mostra vantagens, penalidades, equipamento atual e preço. O Troll também muda visualmente conforme sua arma/proteção/relíquia. Não há consumíveis, venda nem compra automática de uma build nesta entrega.

## Combate com resposta e espaço para reação

O leve prepara por 100 ms; o pesado, por 320 ms. O servidor verifica direção, distância e obstáculos no momento do impacto, permitindo sair do alcance durante a preparação. A movimentação continua possível, mais lenta durante o pesado. A fila guarda um único ataque nos últimos 180 ms da recarga, e segurar o botão mantém a cadência.

Três leves no **mesmo alvo**, dentro de 2,8 segundos entre acertos, dão +25% no terceiro. Errar ou usar pesado reinicia o combo. Esquivar cancela o golpe ainda em preparação, sem devolver a recarga gasta, e abre 1,2 segundo para um acerto com +20%; Selo da caça acrescenta 35 pontos percentuais. A esquiva respeita paredes e funciona para a frente mesmo sem uma tecla de movimento.

Acertos confirmados mostram dano real, marca na mira e indicação de combo. Romper uma barricada produz estilhaços, tremor localizado e aviso de passagem aberta. Movimento reduzido desativa o tremor. Ouro e cura por dano usam o HP efetivamente removido, sem explorar overkill. A animação começa localmente, mas dano permanece no servidor; ainda não há previsão de movimento nem compensação de latência para partidas distantes.

## Evidências e limites de balanceamento

**43 testes de regras/rede passaram**, incluindo progressão além do antigo teto, posse de trabalhadores, árvores exclusivas, fog, morte econômica, compras, troca de vida, preparação, combo, fila e cancelamento. Cinco roteiros de navegador passaram sem exceções JavaScript: lobby/reconexão, construção física, resultado/revanche, controles/mapa e novas mecânicas. O último usa recursos/posições de fixture em servidor isolado; as compras e ações percorrem a UI, WebSocket e simulação reais.

O lote final tem 72 partidas a 20 Hz, pareadas com a versão anterior: dois mapas, 2/5/8 Elfos, Elfos normais/difíceis e Troll normal. Não há bônus exclusivos para bots.

| Métrica | Antes, fome corrigida | Progressão infinita atual |
|---|---:|---:|
| Vitórias Troll | 68 | 38 |
| Vitórias Elfos | 3 | 32 |
| Sem vencedor aos 25 min | 1 | 2 |
| Mediana das concluídas | 10:25 | 7:00,5 |
| Partidas entre 12–18 min | 17/72 | 8/72 |

O total de vitórias mais próximo não comprova equilíbrio. No mapa compacto 1v2, o Troll venceu as 12 partidas; no mapa grande 1v8, venceu uma, os Elfos venceram nove e duas ficaram inconclusivas. A duração ficou **mais distante da meta**. Seis vitórias dos Elfos ocorreram por fome; 26 por dano das torres. As diferenças por mapa, tamanho do lobby e dificuldade precisam orientar a próxima rodada.

Relatórios: `artifacts/progression-infinite-final-20hz.json` e `artifacts/progression-infinite-comparison.json`. `progression-infinite-20hz.json` preserva a iteração intermediária; `progression-comparison.json` continua comparando os três lotes históricos. `balance.json` é analítico; `combat-audit.json` contém 126 fixtures de combate real, sem itens, com combo e habilidades conforme o cenário.

O teste de simulação completa mantém as cinco seeds anteriores, mas ampliou a janela de 20 para 30 minutos: a seed SIM-2, fora desse lote de 72, só terminou perto de 28:26. Foi removida a exigência de que esse pequeno conjunto produzisse ambos os vencedores; uma regra explícita verifica vitória legítima dos Elfos por dano de torres. Isso valida encerramento e regras, **não** cumpre a meta de duração.

## Próximas melhorias, ainda não implementadas

1. **Ritmo antes de novos multiplicadores:** medir primeira eliminação, tempo até primeiro item e tempo sem decisões por tamanho de lobby. Proteger o investimento inicial sem deixar 1v8 se arrastar. Testar fases de preparação, disputa econômica, cerco e desfecho com compras/objetivos próprios; apenas adiar cronômetros já falhou no experimento anterior.
2. **Resposta ativa do Elfo:** testar uma habilidade curta de proteção de estrutura e uma escolha de fuga/reposicionamento, com recarga compartilhada ou exclusão entre especializações. O Elfo deve decidir quando responder ao pesado/rugido, além de manter reparo pressionado.
3. **Fratura legível na barricada:** experimentar uma abertura curta após pesado bem acertado, com sinal visual para ambos. Consumir a abertura com outro golpe ou neutralizá-la por uma ação do Elfo. Evitar acrescentar outra barra permanente e não acumular fratura infinitamente.
4. **Disputa de bosque:** sinalizar capacidade e produção potencial de cada clareira no mapa descoberto. Testar escolha entre crescimento seguro de poucos Wisps e trabalhadores externos mais eficientes; revisar posicionamento das árvores antes de aumentar quantidades.
5. **Sensação sob latência:** playtests humanos com medição de input→animação→impacto, áudio distinto por material e teste de previsão de movimento com reconciliação. Não reduzir janelas de reação para esconder atraso de rede.

Cada experimento deve manter telemetria separada de Cerco/Caçador/Sustentação, região, tamanho do lobby e experiência dos jogadores. As propostas acima não são apresentadas como recursos disponíveis no jogo.
