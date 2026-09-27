# Análise V3.4 pós-patch — partida observada

Comparação entre o baseline V3.3.1 e a primeira partida observada após
`v3.4-observed-snowball-1`. As duas partidas usaram a seed de mapa `THORNHOLD`,
mas variantes de rota diferentes; portanto, a comparação é direcional e não um
teste pareado perfeito.

## Resultado

| Métrica | Baseline | V3.4 | Diferença |
| --- | ---: | ---: | ---: |
| Resultado | Troll | Troll | — |
| Duração | 39:56 | 33:32 | -6:24 |
| Primeira base rompida | 07:14 | 07:56 | +0:42 |
| Primeira morte | 18:33 | 13:32 | -5:01 |
| Terceira morte | 34:24 | 23:45 | -10:39 |
| Início do último Elfo | 36:51 | 27:50 | -9:01 |
| Tempo do último Elfo até o fim | 03:05 | 05:42 | +2:37 |
| Cercos | 56 | 35 | -21 |
| Sucesso em cercos | 51,8% | 51,4% | -0,4 pp |
| Duração média do cerco | 7,5 s | 13,1 s | +5,6 s |
| HP perdido por cerco | 9,0% | 12,7% | +3,7 pp |
| Retreats completos | 1 | 3 | +2 |

Depois da primeira morte, as eliminações ocorreram em intervalos de 4–6 minutos.
Essa cadência foi mais legível que no baseline. O primeiro rompimento também
aconteceu um pouco mais tarde, apesar da partida terminar antes.

## Economia do Troll

| Fonte | Baseline | V3.4 | Participação V3.4 |
| --- | ---: | ---: | ---: |
| Dano | 140.872 | 122.364 | 61,1% |
| Objetivos | 62.876 | 29.938 | 15,0% |
| Threat Income | 138.973 | 47.970 | 24,0% |
| Total | 342.721 | 200.272 | 100% |

O soft cap funcionou. Threat Income caiu 65,5% e passou de 40,6% para 24,0% da
renda total, dentro da meta inicial de menos de 30%. Não há justificativa nesta
partida para outro nerf nessa fonte.

O Troll terminou com 80 upgrades, contra 90 no baseline, e gastou 159.204 Gold,
contra 269.272. Mesmo com menos progressão econômica, ainda conseguiu encerrar a
partida.

## Sustain e defesa

| Métrica | Baseline | V3.4 |
| --- | ---: | ---: |
| Dano recebido de torres | 88.753 | 73.705 |
| Cura por regeneração | 76.731 | 60.306 |
| Cura por carta durante combate | 19.086 | 7.861 |
| Cura consumível | 10.228 | 11.064 |
| Cura no Santuário | 1.793 | 2.335 |
| Retreats | 1 | 3 |

A supressão de regeneração sob fogo mudou o comportamento esperado: o Troll
recuou três vezes e, nas duas retiradas completas, voltou com aproximadamente
75% HP. Isso é melhor que permanecer atacando até absorver toda a defesa.

Ainda não é possível separar corretamente regeneração em combate de regeneração
fora de combate no total `healing.regen`. Essa instrumentação deve ser adicionada
antes de outro ajuste de sustain.

## Torres lendárias

A telemetria nova confirmou seis torres lendárias ativas:

- Tempo total de feixe: `294,8 s`.
- Dano total de feixe: `35.664`.
- Dano total das torres: `73.705`.
- Participação dos feixes no dano de torres: `48,4%`.

As torres lendárias estavam funcionando. O antigo campo `shots: 0` era apenas
inadequado para armas de feixe.

## Progressão lendária

| Marco | Baseline | V3.4 |
| --- | ---: | ---: |
| Espada lendária do Troll | 11:49 | 10:53 |
| Primeira estrutura lendária Elfa | 17:42 | 19:05 |
| Primeira torre lendária Elfa | 19:59 | 19:23 |
| Vantagem temporal do Troll | 5:53 | 8:12 |

Apesar de o requisito da espada ter aumentado, a IA comprou upgrades com maior
eficiência nesta rota e a obteve antes. Requisitos baseados apenas na soma dos
upgrades não estabilizam seu momento de entrada entre partidas.

Uma solução mais previsível seria manter os requisitos atuais e também exigir
Troll Level 10. Nesta partida isso liberaria a espada perto de `16:57`; no
baseline, perto de `18:23`. A diferença para as defesas lendárias cairia para
aproximadamente 0–3 minutos. Essa alteração ainda não deve ser aplicada sem
medir quanto do cerco foi realmente resolvido pelo execute lendário.

## Elfos

O primeiro eliminado foi `Faelar · Mercador`, após usar um stun e um
reassentamento. Aos 12:56 ele havia gasto aproximadamente:

- 18.341 Gold em economia;
- 7.591 Gold em defesa;
- 25.932 Gold no total.

Ele não ignorou completamente a defesa. A rota apenas o tornou o primeiro alvo
e sua especialização econômica não sobreviveu ao segundo contato. Todos os cinco
Elfos morreram por ataque corpo a corpo; após contato direto, o Troll levou em
média aproximadamente um segundo para concluir cada eliminação.

Para bots, a próxima melhoria deve ser comportamental: iniciar a fuga antes do
contato corpo a corpo e preservar distância depois do stun. Não é necessário
aumentar HP ou velocidade dos Elfos humanos com base nesta partida.

## Recomendações

### Manter sem alterações

- Soft cap do Threat Income.
- Supressão de regeneração sob fogo de torre.
- Roubo de vida reduzido contra estruturas.
- Dano, HP e cura base.
- Dano das torres lendárias.
- Cadência atual do último Elfo.

### Próxima instrumentação

1. Separar `combatRegen`, `restRegen`, `sanctuary` e valor suprimido por torres.
2. Contar execuções da espada lendária, HP removido e estruturas afetadas.
3. Registrar início do primeiro contato corpo a corpo e tempo de fuga de cada
   Elfo.
4. Registrar nível e distribuição dos upgrades no momento em que a espada é
   liberada.

### Próximo ajuste candidato

Somente após a instrumentação, testar a espada condicionada também ao Troll
Level 10. O objetivo é estabilizar sua janela de entrada, não enfraquecer todos
os atributos do Troll.

## Instrumentação e fuga implementadas

O experimento seguinte foi preparado sem alterar Threat Income, sustain ou
torres:

- regeneração agora é separada em `combatRegen`, `restRegen`, `sanctuary` e
  `towerSuppressed`, mantendo também o total agregado em `regen`;
- a espada lendária registra quantidade de execuções, HP efetivamente removido,
  tipo de estrutura e uma amostra dos eventos em `legendaryExecutions`;
- Elfos bots mantêm um destino de evacuação persistente, prolongam a fuga se o
  Troll continuar próximo e só retornam após sair da base, cumprir o tempo
  mínimo e permanecer dez segundos sem ameaça próxima;
- a telemetria registra `evacuationHolds`, `evacuationReturns` e o tempo da
  última evacuação.

O requisito adicional de Troll Level 10 para a espada permanece desligado. Ele
será o próximo experimento isolado depois de uma partida observada com essa
instrumentação, evitando misturar medição e mudança de balanceamento.

## Recuperação leve da Barricada

Para reduzir a vantagem de investidas incompletas, a Barricada recupera `0,35%`
do HP máximo por segundo, sem teto fixo. A recuperação começa após oito segundos
sem dano; a presença do Troll, sozinha, não a bloqueia, mas cada novo golpe
reinicia a espera. O total recuperado é registrado em `wallRegeneration`.

O reparo ativo da Barricada também passou de `42 HP` fixos para
`42 HP + 0,5% do HP máximo` por pulso. Oficina, caminho de Defesa, ajuda de
aliados, fantasmas e Pressão de Cerco continuam multiplicando esse valor. O
componente fixo preserva o early game e o percentual mantém a ação relevante
no mid/late game.

No smoke test determinístico 1×5, essa combinação levou a partida ao limite de
60 minutos, encerrando por pontos com vitória do Troll. O resultado não motivou
compensação automática: ele fica registrado como alerta de que a próxima
partida observada deve medir regeneração total, reparo total, tempo de cerco e
HP recuperado por tier antes de um novo ajuste.

Quando um Núcleo é destruído, o bot também memoriza a clareira perdida e a
posição do Troll durante a janela de reassentamento. Ele exclui a antiga base
enquanto houver outra opção, mantém um novo destino persistente e favorece um
refúgio mais distante da ameaça, evitando o ciclo de voltar para a mesma entrada
e morrer novamente.

### Meta para a próxima partida observada

- Primeira base rompida: 7–10 min.
- Primeira morte: 10–15 min.
- Intervalos entre eliminações: 3–6 min.
- Threat Income: 20–30% do ouro do Troll.
- Pelo menos 2 retreats reais em uma partida com torres lendárias.
- Último Elfo resolvido em 5–10 min.
- Duração total de referência: 25–35 min para bots competentes.
