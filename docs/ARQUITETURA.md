# Arquitetura do slice

## Autoridade e ciclo

`SessionService` controla membros, host, senha derivada com scrypt, slots e permissões. `Match` controla todos os estados de jogo, recursos, decisões de IA, movimento, colisão, construções, dano e vitória. O cliente recebe o mapa validado e snapshots filtrados, interpola os modelos e envia intenções.

```text
MAIN_MENU → LOBBY → LOADING → PREPARATION → MATCH_ACTIVE → MATCH_END
               ↑                                         ↓
               └──────── RETURN_TO_LOBBY ──────────────────┘
```

O menu é estado de interface. Os estados de sessão e partida usam as constantes de `shared/config.js`. A geração é síncrona e determinística: o servidor só publica o mapa depois de todas as bases passarem pela validação. Durante LOADING o lobby deixa de aceitar mutações. O resultado mantém a sessão; voltar limpa a simulação e reinicia o Ready.

Servidor: 20 passos fixos/s. Snapshots: 10/s. Clientes enviam direção normalizada, botões e identificadores; não enviam HP, posições finais, preços, dano ou renda. A física subdivide o movimento para impedir atravessar bloqueios, inclusive quando as simulações automatizadas usam passos de 100 ms. O cliente não faz previsão de física; em conexões com latência elevada o movimento terá atraso perceptível.

## Slots e controladores

Um slot define o papel; um ocupante define humano ou bot. Um personagem pertence ao slot, de modo que desconectar/substituir o controlador não recria personagem nem recursos.

```text
WebSocket humano → Match.input / Match.act ─┐
                                          ├→ mesmas regras → mesmo personagem
AIController → Match.act / vetor de entrada┘
```

Perfis de IA alteram frequência de decisão, prioridades econômicas, limiar de reparo, retirada e especialização. Atributos, preços e cooldowns não mudam por dificuldade. O Troll mantém memória de observações e terreno descoberto por visão, seleciona fronteiras navegáveis e procura alvos visíveis. A IA dos Elfos escolhe uma clareira livre, reivindica-a com um núcleo e executa sua sequência de economia e defesa.

O host pode mover humanos entre slots, inclusive trocá-los com bots. Novos membros aguardam no banco quando todos os slots contêm bots; podem ocupar um deles se a escolha livre estiver ativa. O Ready de todos os membros conectados é invalidado após qualquer mudança material de configuração ou de times.

Tokens aleatórios de retomada ficam em `sessionStorage`, não são códigos de sala. O servidor mantém slots humanos desconectados durante a partida; com takeover ativo, seu controlador vira IA. O token restaura o humano. O host migra para um membro conectado. Salas sem conexões expiram em dois minutos. O retorno ao lobby converte ou remove ocupantes desconectados.

## Mundo e garantia de entrada

Uma seed produz a mesma grade, posições, árvores e decoração. Clareiras ocupam regiões separadas cercadas por células de rocha intransponíveis. Há somente uma célula de acesso em cada perímetro. Não há salto, escalada ou teleporte de cliente.

Para cada clareira o servidor valida:

1. Flood fill do spawn exterior alcança o centro.
2. Exatamente uma célula do perímetro é transitável.
3. Remover o portão desconecta o interior do exterior: o portão é um vértice de corte.

Isso comprova uma única entrada independente; não significa que só exista um caminho possível nas áreas abertas externas. A validação é estrutural, não uma contagem ingênua de todos os trajetos. O mapa é rejeitado se qualquer base falhar. O pathfinding é A* em quatro vizinhos; o movimento contínuo testa o volume do personagem contra a mesma grade e contra estruturas.

As áreas construíveis são planas. Elevações e faces de rocha são bloqueadas pela navegação, evitando bases acessíveis por uma encosta. A geometria visual é determinística e não possui autoridade sobre o movimento.

## Economia e encerramento

Na candidata 0.2, o stun élfico é validado pelo servidor: exige a ruptura recente da própria Barricada, alcance, visão e uma recarga compartilhada. Ele interrompe intenção, dash e golpe preparado do Troll por três segundos. A destruição de um Núcleo abre atualmente uma janela de reassentamento de 60 segundos; o voucher único que garante o novo Núcleo está especificado no backlog da alpha.

O núcleo é a principal fonte de ouro; a mina complementa renda, a oficina melhora coleta/reparo. A coleta manual consome estoque; árvores esgotadas rebrotam após 35 segundos quando não há estrutura no local. Wisps ligados às árvores geram madeira sem consumir estoque e dependem de dono vivo e núcleo concluído a até 25 metros. `shared/wisps.js` valida formação, exclusividade da árvore, evolução e transferência. Wisps são alvos econômicos, não participantes da condição de vitória.

Obras começam com 15% do HP e progridem com um construtor perto. Estruturas, Wisps e atributos do Troll não têm nível máximo de compra; fórmulas evitam overflow e velocidades têm ganhos decrescentes. Os modelos visuais têm quatro estágios, independentes do nível real. `shared/equipment.js` centraliza nove itens, três espaços de equipamento e estatísticas usadas pelo servidor, HUD, loja e auditorias. Trocas exigem cinco segundos fora de combate e preservam a fração de vida.

O ouro do Troll usa `min(dano, HP restante)` e escalonamento limitado por Elfos vivos, renda, bases econômicas e tempo. Estruturas possuem orçamento de recompensa; reparos pagos recuperam apenas uma pequena fração desse orçamento. Dano já aplicado não pode ser cobrado novamente. Não há ataque aliado ou economia concedida por mensagens do cliente.

O combate agenda o impacto após a preparação de cada golpe e revalida alcance, direção e obstrução nesse instante. A fila aceita um golpe nos últimos 180 ms de recarga. Três leves no mesmo alvo geram combo; esquiva cancela a preparação e abre uma janela de bônus. A animação local antecipa intenção, mas vida, dano e recompensa continuam autoritativos, sem compensação de latência.

`shared/jobs.js` calcula cancelamento de obras, formação e melhorias. O investimento registra custo e duração no servidor; o snapshot oferece a prévia de reembolso ao dono e aos observadores. A ação verifica propriedade, proximidade, estado e dano recente. Não se aceitam preços ou reembolsos enviados pelo cliente. Cancelar não gera recompensa de destruição e não pode ser repetido sobre a mesma operação.

`client/selection.js` reúne os painéis contextuais e `client/icons.js` os símbolos vetoriais originais. `client/hud.css` define a apresentação da partida separada das telas de sala. Atualizações do painel preservam foco, seleção de opções e rolagem. Marcadores clicáveis mantêm seus elementos DOM e ficam estáveis sob o cursor. O cliente encerra repetições de teclado ao cancelar, sem interromper investimentos apenas por fechar o painel.

O cerco usa desbloqueio do tier IV aos 3:30, bônus comprado, escalada de dano durante exposição às torres e fome por inatividade que bloqueia regeneração. As regras são iguais em partidas humanas e de bots e não consultam a taxa de vitória. Esses cronômetros ainda não realizam a meta de partidas de 12–18 minutos.

## Visão e superfície de rede

Snapshots omitem unidades e estruturas inimigas fora da visão da equipe. Economia, níveis e cooldowns privados são enviados apenas ao dono. Eventos também são filtrados. O mapa estático e a seed são públicos; isso não revela onde estão personagens ou quais clareiras foram ocupadas. No minimapa, clareiras aparecem depois de descobertas.

Mensagens têm limite de tamanho e frequência. Números não finitos, identificadores inválidos, propriedades herdadas, movimentos excessivos, ações fora de alcance e mutações sem permissão são rejeitados. HTTP só serve diretórios de assets; código do servidor e telemetria não são rotas públicas. Há heartbeat WebSocket e proteção básica de origem.

O servidor atual mantém as salas em memória. Para persistência, distribuição regional e autenticação de produção, o ponto de extensão é `SessionService`; a simulação central não precisa ser duplicada.

Versões de jogo, protocolo, balanceamento e IA ficam em `shared/version.js`. Relatórios novos da arena incluem essas versões, commit, estado sujo e hash da configuração para comparação reproduzível.
