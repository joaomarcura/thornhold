# Relatório da Etapa 1 — `0.2.0-alpha.2`

Data: 24/09/2026. Commit final simulado: `985d9293df79307f15f4c4d37310edf34514c881`.

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

Quatro partidas por célula não bastavam para estimar win rate isolada com confiança, mas localizaram o padrão histórico: a curva de dificuldade e o 1v5 favoreciam os Elfos, enquanto 1v8 fácil favorecia o Troll. Esse diagnóstico originou `GAME-111` e a matriz cruzada abaixo.

## Fechamento de `GAME-111`

A validação definitiva repetiu dez seeds idênticos em cada combinação de lobby, dificuldade e mapa, totalizando 240 partidas. O balanceamento usa compensação econômica por lobby/mapa, preserva ouro para a progressão lendária e aplica 15% de cerco somente no duelo, onde o Troll frequentemente morria antes de destruir a primeira estrutura.

| Recorte | Troll–Elfos |
|---|---:|
| Total | 105–135 |
| 1v1 | 20–40 |
| 1v2 | 26–34 |
| 1v5 | 25–35 |
| 1v8 | 34–26 |
| Fácil | 33–47 |
| Normal | 33–47 |
| Difícil | 39–41 |
| Compacto | 51–69 |
| Grande | 54–66 |

Todas as partidas terminaram por regras do jogo. A mediana foi 10:20; as médias de falha de navegação e exploração foram 0,32 e 7,47 por jogo. O cenário principal, 1v5 normal compacto, ficou em 4–6. Nenhum recorte de mapa ou dificuldade supera 65% para um lado.

O 1v1 permanece em 33,3%–66,7%, uma vitória em 60 além do teto inicial. O diagnóstico é explícito: seis células pequenas de dez jogos ficam entre 4–6 e 3–7; o gargalo é a concentração da defesa de uma única base contra o Troll antes da primeira demolição. Aumentar o cerco de 15% para 20% piorou o lote para 19–41, indicando uma curva não monotônica da IA. O valor menor foi mantido para evitar overfitting; o 1v1 deve ser confirmado em playtest humano.

## Evidências

- Baseline compacto: [`baselines/v0.2.0-alpha.2.json`](../baselines/v0.2.0-alpha.2.json).
- Artefato completo de 100 jogos: `artifacts/v0.2.0-alpha.2-stage1-100.json` (SHA-256 `2f4b0c8c…48faa9`).
- Matriz completa de 96 jogos: `artifacts/v0.2.0-alpha.2-matrix-96.json` (SHA-256 `8a97decf…bb450`).
- Matriz cruzada final de 240 jogos: `artifacts/v0.2.0-alpha.2-game111-final-240.json` (SHA-256 `eed6bce6…52b56a`).
- Portão de qualidade: 50 arquivos verificados, 78 testes e dois fluxos de navegador aprovados.
