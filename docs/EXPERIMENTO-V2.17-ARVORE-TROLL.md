# V2.17 — Árvore de crescimento do Troll

## Hipótese

Organizar os oito atributos em três ramos e exigir investimento distribuído dentro de cada ramo poderia converter melhor o ouro tardio em uma resposta coerente aos cercos fracassados.

- Predador: Fúria, Frenesi e Passos largos.
- Colosso: Vitalidade, Pele de pedra e Vigor.
- Demolidor: Quebra-fortaleza e Rugido ancestral.
- Faixas: Fundação 1–5, Especialização 6–10, Lendário 11–15 e Épico 16–20.

O teste também reduziu experimentalmente o crescimento tardio do custo do Troll de `1.35` para `1.27`.

## Resultado em 20 seeds 1×5

| Métrica | V2.15 | V2.16 recall/adaptação | V2.17 experimental |
| --- | ---: | ---: | ---: |
| Troll / Elfos / inacabadas | 0 / 9 / 11 | 0 / 7 / 13 | 0 / 5 / 15 |
| Duração média | 38:16 | 38:55 | 40:28 |
| Estruturas destruídas | 16.8 | 15.5 | 16.1 |
| Torres destruídas | 4.45 | 3.90 | 4.05 |
| Cercos por partida | 32.85 | 29.90 | 30.40 |
| Sucesso dos cercos | 35.46% | 35.95% | 35.69% |
| PREPARE_ASSAULT médio | 7:03 | 7:47 | 8:13 |

Artefato: `artifacts/v2-17-growth-tree-20.json`.

## Decisão

O experimento numérico foi rejeitado. As travas e a redução de custos não melhoraram ruptura, aumentaram preparação e elevaram partidas inacabadas.

A organização visual em três ramos foi mantida porque melhora leitura sem alterar atributos, custos ou liberdade de combinação. As travas foram removidas e o custo original foi restaurado. A memória do último cerco continua orientando as prioridades do bot.

## Diagnóstico

O Troll já recebe e gasta ouro suficiente. O problema dominante não é disponibilidade de níveis: ele ainda perde observações estratégicas, volta a explorar com bases vivas e repete cercos de eficiência semelhante. Uma próxima mudança de progressão só deve ser testada depois de corrigir a conversão entre memória do alvo, preparação e assalto efetivo.
