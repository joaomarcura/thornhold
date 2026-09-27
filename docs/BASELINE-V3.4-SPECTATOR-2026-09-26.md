# Baseline V3.4 — partida observada de 26/09/2026

Esta partida é o baseline humano-observado para o primeiro passe da V3.4.
Ela foi disputada apenas por bots e acompanhada pelo modo espectador.

## Identificação

- Telemetria: `telemetry/matches.jsonl`, registro mais recente em `2026-09-26T18:35:07.464Z`
- Seed: `THORNHOLD`
- Variante de rota: `4CAD55-1-1-CW`
- Resultado: vitória do Troll por eliminação do exército
- Duração: `39:56`
- Placar final: Troll `304.837`, Elfos `529.946`
- Fórmula de telemetria: `v3.3.1-late-parity-2`

## Linha do tempo principal

| Evento | Tempo |
| --- | ---: |
| Primeira base destruída | 07:14 |
| Espada lendária do Troll | 11:49 |
| Primeira estrutura lendária dos Elfos | 17:42 |
| Primeira torre lendária dos Elfos | 19:59 |
| Primeiro Elfo eliminado | 18:33 |
| Segundo Elfo eliminado | 29:34 |
| Terceiro Elfo eliminado | 34:24 |
| Fase de último Elfo | 36:51 |
| Último Elfo eliminado | 39:56 |

O Troll terminou sua progressão lendária aproximadamente seis minutos antes da
primeira estrutura lendária dos Elfos. Apesar disso, a primeira eliminação não
foi precoce. O problema observado é de inevitabilidade no mid/late game, não uma
eliminação imediata no early game.

## Progressão final

### Troll

- Nível de cartas: `17`
- Soma dos níveis de loja: `90`
- Espada lendária: sim
- Estruturas destruídas: `60`
- Dano total: `271.937`
- Dano em estruturas: `271.292`
- Ouro gerado: `342.721`
- Ouro gasto: `269.272`
- Recalls: `12`
- HP final: `9.428 / 9.428`

Origem do ouro:

| Fonte | Ouro | Participação |
| --- | ---: | ---: |
| Dano | 140.872 | 41,1% |
| Objetivos | 62.876 | 18,3% |
| Threat Income | 138.973 | 40,6% |

O Threat Income sozinho financiou praticamente a mesma quantidade que todo o
dano causado. Somado às recompensas de objetivos, 58,9% do ouro do Troll veio de
fontes adicionais ao loop principal de causar dano.

Cartas escolhidas: Titan Blood, Thick Hide, Predator, Scavenger, Second Wind,
Battle Regen e Long Stride.

### Elfos

- Ouro total gerado: `1.141.191`
- Ouro total gasto: aproximadamente `1.072.327`
- Upgrades: `638` de estruturas/unidades, além dos upgrades do Troll registrados
  no agregado da partida
- Torres simultâneas atacando o Troll: pico `2`, média `0,65`
- Dano de torres recebido pelo Troll: `88.753`

Os Elfos produziram e investiram muito, mas a progressão econômica não se
converteu em uma condição de vitória antes de o Troll completar sua curva.

## Curva da partida

| Tempo | Elfos vivos | Renda Elfo/s | Renda Troll/s | Upgrades Troll | Estruturas destruídas |
| --- | ---: | ---: | ---: | ---: | ---: |
| 03:56 | 5 | 47,1 | 6,0 | 2 | 0 |
| 05:56 | 5 | 85,3 | 8,6 | 12 | 0 |
| 08:56 | 5 | 272,4 | 14,2 | 12 | 3 |
| 10:56 | 5 | 418,6 | 17,8 | 27 | 4 |
| 12:56 | 5 | 522,4 | 21,1 | 33 | 5 |
| 15:56 | 5 | 655,6 | 31,8 | 41 | 6 |
| 20:56 | 4 | 743,3 | 50,5 | 59 | 16 |
| 25:56 | 4 | 771,3 | 78,9 | 69 | 16 |
| 30:56 | 3 | 656,7 | 105,8 | 75 | 28 |
| 35:56 | 2 | 435,4 | 121,4 | 86 | 40 |

A renda do Troll acelera enquanto a equipe é eliminada. Ao mesmo tempo, cada
morte remove uma economia inteira dos Elfos. Isso produz uma dupla aceleração no
late game: o Troll continua crescendo e a renda coletiva dos defensores cai.

## Comportamento do Troll

- Combate: `44,0%` da partida
- Movimento sem combate: `46,5%`
- Retreat efetivo: apenas `1`, aos `21,2% HP`
- Reengage após retreat: `49,3% HP`
- Cura por consumível: `10.228`
- Cura por regeneração: `76.731`
- Cura no Santuário: `1.793`
- Cercos: `56`
- Cercos bem-sucedidos: `29` (`51,8%`)
- Pior repetição: barricada `s12`, oito tentativas, sete falhas
- Falhas de navegação: `0`
- Falhas de exploração: `0`

O sustain veio predominantemente da regeneração, não do Santuário. O Troll
recebeu `88.753` de dano e recuperou aproximadamente `88.752`, terminando com HP
cheio. Isso indica que a combinação de regeneração, cartas e janelas sem combate
praticamente anulou todo o dano acumulado das torres.

Entre aproximadamente `18:49` e `22:02`, a máquina de estados alternou muitas
vezes entre `EXPLORE`, `RECOVER` e `ROTATE`. Esse comportamento desperdiçou tempo,
mas não impediu a vitória. Corrigi-lo sem revisar o poder do Troll tornaria o
resultado ainda mais favorável ao atacante.

## Nota sobre as torres lendárias

Várias torres lendárias aparecem com `shots: 0`. Isso não prova que deixaram de
atacar: a telemetria incrementa `shots` apenas para projéteis convencionais,
enquanto torres lendárias causam dano por feixe contínuo. A instrumentação deve
registrar tempo de feixe e dano por torre para evitar diagnósticos falsos.

## Diagnóstico para V3.4

Esta partida não justifica reduzir HP ou dano base do Troll. Os principais
candidatos são os aceleradores sobrepostos:

1. Threat Income representando 40,6% do ouro total.
2. Progressão lendária do Troll cerca de seis minutos antes dos Elfos.
3. Regeneração recuperando `76.731 HP`, quase todo o dano recebido.
4. Escalada da loja até soma de nível 90.
5. Recompensas de objetivo somadas ao ouro de dano e ao Threat Income.

## Primeiro experimento recomendado

Alterar somente os aceleradores, preservando combate base, loja física e recall:

1. Aplicar um teto ou retorno decrescente ao Threat Income após ele representar
   uma parcela excessiva da renda do Troll.
2. Reduzir o roubo de vida/regeneração contra estruturas antes de alterar cura
   contra unidades.
3. Atrasar parcialmente a espada lendária por custo/progressão de loja, mirando
   paridade com a primeira defesa lendária dos Elfos.
4. Instrumentar dano e tempo ativo dos feixes lendários.
5. Repetir uma partida completa observada antes de qualquer segundo ajuste.

## Metas de comparação

- Primeira morte: `8–12 min` como faixa de observação, sem forçá-la por regra.
- Primeira progressão lendária dos dois lados com diferença inferior a `3 min`.
- Threat Income abaixo de aproximadamente `30%` do ouro total em uma partida
  saudável, salvo estagnação real.
- Troll não terminar com HP cheio após absorver múltiplas defesas lendárias.
- Último Elfo resolvido em até `5–10 min`, sem ultrapassar `30 min` de duração
  mediana para partidas competitivas.
- Resultado avaliado junto com comportamento; não ajustar automaticamente até
  alcançar 50/50.

## Experimento V3.4 aplicado

Primeira rodada implementada após este baseline:

- Threat Income mantém a fórmula atual até `50 ouro/s`; acima disso, somente
  `35%` do excedente é convertido, com teto absoluto de `100 ouro/s`.
- Regeneração de combate recebe multiplicador `0,5` enquanto o Troll está sob
  fogo recente de torres. Regeneração fora de combate, cura consumível e cura
  do Santuário não foram alteradas.
- Roubo de vida contra estruturas passou de `3%` para `1,5%`, com limite de `1%`
  da vida máxima por golpe. Contra unidades permanece em `8%`, limitado a `2%`.
- Espada Lendária passou de `10` pontos em Dano + Cerco e `18` pontos totais
  para `12` pontos em Dano + Cerco e `24` pontos totais.
- Telemetria schema `10` registra `beamSeconds` e `beamDamage` por torre
  lendária. Fórmula identificada como `v3.4-observed-snowball-1`.

Validação técnica após a implementação:

- `npm run verify`: aprovado.
- Regras e rede: `175/175` testes.
- Suítes reais de navegador: aprovadas.
- O resultado do smoke test acelerado de espectador não será usado como dado de
  balanceamento; a comparação exige uma nova partida completa observada.
