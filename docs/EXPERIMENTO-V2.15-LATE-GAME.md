# Experimento V2.15 — resolução do late game

Data: 2026-09-25  
Baseline pareado: `artifacts/wall-economy-after-20.json`  
Experimento: `artifacts/v2-15-after-20.json`  
Seed canônica: `artifacts/v2-15-exact-thornhold.json`

## Escopo

- Barricada viva é o único alvo acionável de entrada; o interior permanece bloqueado até sua destruição.
- `FINISHER` virou modo, preservando os estados táticos.
- Com até dois Elfos e todas as bases sobreviventes conhecidas, o Troll prepara um assalto em vez de explorar.
- O cerco começa somente quando o Troll consegue atacar o alvo.
- Fortificações sem alternativa entram em `PREPARE_ASSAULT`, sem bônus oculto.
- A renda tardia passou a usar `clamp(6.5 + ElfTeamIncome * 0.05, 6.5, 30)` após 15 minutos e com ao menos um Núcleo maduro.
- A escolha entre barricadas considera TTK, dano esperado das torres durante o TTK e viagem.

Não foram alterados HP/dano base, torres, cura, reparo, economia inicial, Torre Lendária ou equipamento.

## Seed THORNHOLD

A seed problemática foi resolvida em 12:10 com vitória do Troll. A terceira morte ocorreu em 8:07 e o fim quatro minutos depois. O Troll teve zero `noRoute`, destruiu 37 estruturas e concluiu 17 de 26 cercos.

Esse resultado isolado foi uma melhora grande, mas não se repetiu no lote pareado.

## Resultado pareado — 20 seeds, lobby 1x5 normal/compacto

| Métrica | V2.14 | V2.15 |
|---|---:|---:|
| Mediana de duração | 45:00 (teto) | 45:00 (teto) |
| Partidas concluídas | 9/20 | 9/20 |
| Troll / Elfos / inacabadas | 2 / 7 / 11 | 0 / 9 / 11 |
| Primeira morte de Elfo (mediana) | 5:58 | 5:51 |
| Terceira morte de Elfo (mediana) | 11:05 | 10:11 |
| Fase de último Elfo (mediana) | 13:40 | 14:54 |
| Siege success rate | 24,7% | 35,5% |
| Máximo de cercos falhos no mesmo alvo | 9 | 21 |
| `noRoute` do Troll, total | 381 | 1 |
| `EXPLORE`, média | 12:35 | 5:45 |
| `PREPARE_ASSAULT`, média global | 0 | 7:03 |
| `PREPARE_ASSAULT`, partidas que entraram no modo | 0 | 23:30 |
| Troll Gold @ 5m | 4.469 | 4.041 |
| Troll Gold @ 15m | 25.186 | 21.571 |
| Troll Gold @ 25m | 31.335 | 36.693 |
| Elf income @ 10m | 247,0/s | 263,6/s |
| Elf income @ 20m | 433,3/s | 464,5/s |
| Elf income @ 30m | 506,5/s | 552,1/s |
| Maior HP de parede sobrevivente | 68.493 | 73.972 |

## Diagnóstico

O experimento falhou como pacote e ainda não deve virar baseline.

A acessibilidade estrutural funcionou: o `noRoute` do Troll praticamente desapareceu. O tempo médio em exploração caiu 54%, o sucesso de cerco subiu 10,8 pontos percentuais e a eficiência média dos cercos quase dobrou.

O novo gargalo é explícito. Nas partidas que chegaram ao modo final, o Troll passou em média 23:30 em `PREPARE_ASSAULT`. A preparação permitiu novas tentativas, mas não mudou a viabilidade do assalto: as mesmas barricadas acumularam entre 11 e 21 falhas. A renda tardia elevou o ouro do Troll aos 25 minutos, mas começou depois de a economia Elfa já estar madura e não converteu esse ouro em poder suficiente para superar a defesa. Ao mesmo tempo, os Elfos continuaram crescendo durante cada ciclo de preparação.

Portanto, não foram executadas 100 seeds e nenhuma segunda rodada de parâmetros foi aplicada. A próxima revisão deve corrigir o contrato de `PREPARE_ASSAULT`: ele precisa terminar por uma condição verificável de aumento de poder/viabilidade ou escolher uma ação econômica ofensiva diferente, em vez de repetir o mesmo assalto a cada cooldown.
