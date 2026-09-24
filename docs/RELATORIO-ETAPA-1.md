# Relatório da Etapa 1 — `0.2.0-alpha.2`

Data: 24/09/2026. Commit simulado: `f3887611aa6b353664c21f67c617e39027111c68`.

## Resultado reproduzível

A rodada histórica executou as mesmas 100 seeds da `alpha.1`, em passo de 50 ms, comparando automaticamente os dois artefatos. Todas as partidas terminaram por regras de jogo. O teto de 60 minutos pertence somente ao laboratório e não decide vencedor.

| Métrica | alpha.1 | alpha.2 | Variação |
|---|---:|---:|---:|
| Troll–Elfos | 54–46 | 39–61 | −15 / +15 |
| Inconclusivas | 0 | 0 | 0 |
| Decididas pelo relógio | 32 | 0 | −32 |
| Duração média | 15:02 | 10:29 | −4:33 |
| Mediana | 15:27 | 10:26 | −5:01 |
| Falhas de navegação/jogo | 0,71 | 0,72 | +0,01 |
| Falhas de exploração/jogo | 14,23 | 11,95 | −2,28 |

O cenário principal automatizado 1v5 normal no mapa compacto terminou 3–5, com mediana de 10:56. Isso é jogável e conclusivo, mas ainda não alcança a meta ranqueada de 55–60% para o Troll.

## Matriz complementar

Foram executadas mais 96 partidas: 1v1, 1v2, 1v5 e 1v8; fácil, normal e difícil; mapas compacto e grande; quatro repetições por célula. Todas terminaram.

| Recorte | Troll–Elfos |
|---|---:|
| Total | 37–59 |
| 1v1 | 8–16 |
| 1v2 | 11–13 |
| 1v5 | 5–19 |
| 1v8 | 13–11 |
| Fácil | 20–12 |
| Normal | 9–23 |
| Difícil | 8–24 |
| Compacto | 21–27 |
| Grande | 16–32 |

Quatro partidas por célula não bastam para estimar win rate isolada com confiança, mas são suficientes para localizar o padrão: a curva de dificuldade e o 1v5 continuam favorecendo os Elfos; 1v8 fácil favorece o Troll. Esse trabalho segue em `GAME-111` e deve usar seeds cruzadas por cenário, não apenas o agregado.

## Evidências

- Baseline compacto: [`baselines/v0.2.0-alpha.2.json`](../baselines/v0.2.0-alpha.2.json).
- Artefato completo de 100 jogos: `artifacts/v0.2.0-alpha.2-stage1-100.json` (SHA-256 `2f4b0c8c…48faa9`).
- Matriz completa de 96 jogos: `artifacts/v0.2.0-alpha.2-matrix-96.json` (SHA-256 `8a97decf…bb450`).
- Portão de qualidade: 50 arquivos verificados, 76 testes e dois fluxos de navegador aprovados.
