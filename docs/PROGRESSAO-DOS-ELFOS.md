# Progressão dos Elfos — especializações

## Regra central

Ao alcançar **Núcleo nível 5**, cada Elfo escolhe permanentemente uma identidade para a partida. A escolha pertence ao jogador e sobrevive a reassentamentos. Ela pode ser feita com o mouse ou pelas teclas **1, 2 e 3** no painel do Núcleo.

| Caminho | Recurso | Estrutura exclusiva | Habilidade (X) |
| --- | --- | --- | --- |
| Industrial | Madeira Ancestral | Refinaria | Sobrecarga |
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

- **Refinaria:** aumenta passivamente a produção de estruturas e Wisps em sua área. Sobrecarga amplifica o efeito temporariamente.
- **Bastião:** regenera percentualmente estruturas próximas. Fortificação emergencial reduz temporariamente o dano recebido por estruturas da mesma base.
- **Torre Arcana:** ocupa um slot ofensivo próprio, limitado a uma por jogador. Seu disparo é forte, lento e visualmente anunciado. Pulso Arcano revela a região e acelera temporariamente seus disparos.

Todas evoluem até o nível 20 e podem ser reconstruídas, respeitando o limite de uma estrutura exclusiva ativa por jogador.

## Autoridade e telemetria

Escolha, custos, coleta, cooldowns, bônus, dano e automação são validados pela simulação autoritativa. As seeds anteriores preservam a mesma geometria: a vantagem local é derivada sem consumir a sequência aleatória do terreno.

Os resultados guardam a especialização, cartas pesquisadas, recursos especiais coletados, habilidades usadas, construções e unidades de cada jogador. A próxima etapa é calibrar os valores dessas tecnologias com partidas observadas antes de acrescentar uma quarta camada de progressão.
