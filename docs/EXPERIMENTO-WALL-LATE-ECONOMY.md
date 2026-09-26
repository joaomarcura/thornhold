# Experimento controlado — Wall Curve e economia tardia

Data: 2026-09-25  
Baseline: `artifacts/wall-economy-before-20.json`  
Experimento: `artifacts/wall-economy-after-20.json`  
Seed canônica: `artifacts/wall-economy-after-thornhold.json`

## Hipótese

Preservar o early game (níveis 1–9), reduzir o salto Lendário e desacelerar a economia após o nível 9 deveria manter o mid game competitivo e impedir fortalezas exponenciais. Em paralelo, bloqueios de navegação mais persistentes e supressão de alvos com cercos repetidamente ruins deveriam reduzir loops improdutivos.

Nenhum atributo de combate protegido foi alterado.

## Curvas

Os valores de Mina consideram uma economia madura, com o fator de cinco Minas liberado pelo Núcleo.

| Nível | Parede antes | Parede experimento | Núcleo ouro/s antes | Núcleo experimento | Mina ouro/s antes | Mina experimento | Wisp madeira/s antes | Wisp experimento |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 2.310 | 2.310 | 3,00 | 3,00 | 2,86 | 2,86 | 1,40 | 1,40 |
| 4 | 15.844 | 15.844 | 13,48 | 13,48 | 14,05 | 14,05 | 2,73 | 2,73 |
| 9 | 36.248 | 36.248 | 30,83 | 30,83 | 32,15 | 32,15 | 8,34 | 8,34 |
| 10 | 171.090 | 58.722 | 72,76 | 40,85 | 37,93 | 34,07 | 10,43 | 9,01 |
| 15 | 391.413 | 86.281 | 166,46 | 54,67 | 86,78 | 45,60 | 31,83 | 13,24 |
| 20 | 895.457 | 126.776 | 380,82 | 73,16 | 198,53 | 61,02 | 97,14 | 19,46 |

## Resultado pareado — 20 seeds, lobby padrão 1x5

Os percentuais de vitória abaixo usam todas as 20 partidas; partidas sem resolução permanecem separadas. Entre apenas as partidas concluídas, o baseline foi 44,4% Troll / 55,6% Elfos e o experimento foi 22,2% Troll / 77,8% Elfos.

| Métrica | Before | After |
|---|---:|---:|
| Mediana de duração | 22:30 | 45:00 (teto) |
| Partidas concluídas | 18/20 | 9/20 |
| Primeira morte de Elfo (mediana) | 5:49 | 5:58 |
| Terceira morte de Elfo (mediana) | 11:42 | 11:05 |
| Fase de último Elfo (mediana) | 14:43 | 13:40 |
| Troll win rate | 40% | 10% |
| Elf win rate | 50% | 35% |
| Sem resolução | 10% | 55% |
| Siege success rate | 27,4% | 24,7% |
| Pior alvo repetido | 35 tentativas falhas (`SIM-11`, `s13`) | 9 tentativas falhas (`SIM-1`, `s12`) |
| Máximo de cercos falhos no mesmo alvo | 35 | 9 |
| `noRoute` do Troll, total | 1.101 | 381 |
| `noRoute` do Troll, média | 55,05 | 19,05 |
| Troll Gold @ 5m | 4.418 (20 amostras) | 4.469 (20) |
| Troll Gold @ 15m | 29.520 (17) | 25.186 (19) |
| Troll Gold @ 25m | 27.842 (7) | 31.335 (17) |
| Elf income @ 10m | 243,8/s (20) | 247,0/s (20) |
| Elf income @ 20m | 404,8/s (11) | 433,3/s (18) |
| Elf income @ 30m | 1.046,8/s (3) | 506,5/s (14) |
| Maior HP de parede sobrevivente | 201.886 | 68.493 |

`Elf income` soma ouro e madeira por segundo. Métricas tardias possuem viés de sobrevivência: o número de amostras é mostrado para não comparar populações diferentes como se fossem equivalentes.

## Diagnóstico

O experimento falhou como pacote e não deve virar baseline.

As correções de acessibilidade funcionaram: `noRoute` caiu 65,4%, e o pior loop de alvo caiu de 35 para 9 tentativas. As curvas também eliminaram a parede exponencial e reduziram fortemente a explosão econômica aos 30 minutos.

Porém, a supressão ficou forte demais. Depois de rejeitar vários alvos, o Troll não encontra uma alternativa significativa e passa tempo excessivo em `EXPLORE`/`ROTATE`, mesmo quando deveria voltar a uma fortificação com uma condição explícita de reavaliação. Na seed `THORNHOLD`, por exemplo, foram 1.660,55 segundos em `EXPLORE`; a partida não terminou em 45 minutos. Isso reduz dano, renda por dano e pressão efetiva, anulando a renda tardia adicional.

Portanto, não foram executadas 100 seeds e nenhuma segunda rodada de parâmetros foi feita. O próximo experimento deve manter as melhorias de acessibilidade, mas tratar separadamente a regra de retorno a um alvo suprimido quando não houver alternativa significativa ou quando existir progresso/poder suficiente.
