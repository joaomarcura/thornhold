# Progressão dos Elfos — especializações

## Regra central

Ao alcançar **Núcleo nível 5**, cada Elfo escolhe a identidade do refúgio atual. Se o Núcleo cair e o Elfo reassentar, a especialização pode ser escolhida novamente de acordo com o recurso da nova clareira. A escolha pode ser feita com o mouse ou pelas teclas **1, 2 e 3** no painel do Núcleo.

| Caminho | Recurso | Estrutura exclusiva | Habilidade (X) |
| --- | --- | --- | --- |
| Industrial | Madeira Ancestral | Nenhuma | Sobrecarga no Núcleo |
| Fortaleza | Cristal | Bastião | Fortificação emergencial |
| Arcano | Mana | Torre Arcana | Pulso Arcano |

As habilidades possuem recarga-base de 90 segundos e evoluem automaticamente nos marcos de Núcleo 5, 10, 15 e 20. Não há penalidades de atributos nem limite energético escondido.

## Tecnologias do reino

Nos níveis de Núcleo **8, 12 e 16**, o jogador escolhe uma entre três cartas permanentes. A pesquisa ocorre no painel do Núcleo, aceita mouse ou teclas **1, 2 e 3** e consome o recurso da especialização: 30 unidades no primeiro marco, 50 no segundo e 80 no terceiro.

- Nível 8: produção, Wisps comuns ou duração da habilidade.
- Nível 12: potência da estrutura exclusiva, logística de Wisps especiais ou recarga da habilidade.
- Nível 16: economia e estrutura exclusiva, resistência global das construções ou habilidade completa.

As cartas só aplicam bônus; nenhuma possui penalidade. A escolha pertence ao Elfo e persiste durante reassentamentos. Bots pesquisam segundo sua personalidade e formam um Wisp especial para alimentar a progressão quando necessário.

## Recursos especiais

Cada clareira contém um depósito finito associado à sua vantagem local. Existem também depósitos externos maiores. Segurar **R** coleta o recurso diretamente para a reserva do jogador; não há transporte até o Núcleo. Ao morrer, o jogador perde sua reserva especial.

Todos os Elfos podem formar Wisps especiais. Cada depósito aceita apenas um e o Wisp pode ser morto pelo Troll. Quando o depósito seguro se esgota, ele procura automaticamente um depósito externo livre do mesmo tipo. Bots também formam esses Wisps e expandem para depósitos externos.

## Estruturas

- **Industrial:** não possui mais construção exclusiva. A Sobrecarga é ativada pelo Núcleo e amplifica temporariamente a produção da base; Wisps especiais mantêm o bônus Industrial.
- **Bastião:** regenera percentualmente estruturas próximas. Fortificação emergencial reduz temporariamente o dano recebido por estruturas da mesma base.
- **Torre Arcana:** ocupa um slot ofensivo próprio, limitado a uma por jogador. Seu disparo é forte, lento e visualmente anunciado. Pulso Arcano revela a região e acelera temporariamente seus disparos.

Bastião e Torre Arcana evoluem até o nível 30 e podem ser reconstruídos, respeitando o limite de uma estrutura exclusiva ativa por jogador. O nível 20 continua sendo o marco Épico; o nível 30 é o marco Ascendente. Refinaria e Oficina foram retiradas das partidas novas e permanecem apenas como compatibilidade de leitura para históricos antigos. O Núcleo produz Essência a partir do nível 4 e também concentra a escolha do caminho Economia, Defesa ou Tecnologia.

## Projeto Épico do reino

O nível 20 não consome mais Essência. Cada melhoria Épica usa o mineral da especialização ativa: Madeira Ancestral para Industrial, Cristal para Fortaleza e Mana para Arcano. A interface mostra o mineral e a quantidade exigida diretamente no botão de melhoria.

O diretor começa a preparar uma base aos 10 minutos. Aos 15 minutos, uma fundação com Núcleo, Barricada e Torre no nível 8, além de Mina, pode ser formalizada como o único Projeto Épico da equipe; Fortaleza e Arcano também exigem sua estrutura exclusiva. Uma base que já tenha Torre Lendária pode entrar antes ao cumprir os demais requisitos. Fora de cerco, a progressão segue Núcleo → Barricada → Torre → Mina → estrutura exclusiva, quando houver. Um alvo pode abrir no máximo dois níveis de vantagem; antes de continuar, o projeto traz os demais edifícios de volta à mesma faixa. Durante pressão real, Barricada e Torre assumem a frente da mesma escada.

Ao iniciar o projeto, ouro, madeira, Essência e o mineral especializado necessário passam a ter reserva explícita. O diretor mede estoque, custo restante e déficit, designa um Wisp especial imediatamente quando necessário e impede compras paralelas de consumirem a reserva. Os quatro marcos Industriais — ou cinco para Fortaleza e Arcano — recebem 45% de eficiência adicional de custo até o nível 20. Se Mina ou uma estrutura exclusiva ativa for destruída, o projeto tenta vincular uma substituta e concede até dois minutos para reconstrução antes de abandonar o investimento.

Custos minerais para alcançar o nível 20:

- Núcleo, Barricada e Torre: 30 unidades cada;
- Mina: 20 unidades;
- Bastião ou Torre Arcana: 30 unidades.

Os marcos possuem função real:

- Núcleo Épico aumenta em 20% a produção da base;
- Mina Épica aumenta sua própria produção em 75%, ajudando a financiar os demais marcos;
- estrutura exclusiva Épica, quando houver, recebe 60% mais potência;
- Barricada mantém seu salto defensivo e a Torre Épica recebe 40% mais vida e 75% mais dano;
- completar todos os marcos ativos concede ao reino mais 15% de produção e 15% de redução de dano estrutural naquela base.

Bots reservam capital para um projeto por equipe, formam Wisp do mineral correspondente desde o início e registram cada marco, gasto e tentativa na telemetria. Checkpoints econômicos também registram, por recurso e por jogador, estoque, geração, gasto, déficit do projeto e quantidade de Wisps dedicados.

## Autoridade e telemetria

Escolha, custos, coleta, cooldowns, bônus, dano e automação são validados pela simulação autoritativa. As seeds anteriores preservam a mesma geometria: a vantagem local é derivada sem consumir a sequência aleatória do terreno.

Os resultados guardam a especialização, cartas pesquisadas, recursos especiais coletados, habilidades usadas, construções e unidades de cada jogador. A próxima etapa é calibrar os valores dessas tecnologias com partidas observadas antes de acrescentar uma quarta camada de progressão.
