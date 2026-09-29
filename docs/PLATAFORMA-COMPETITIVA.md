# Plataforma competitiva — v0.4

## Arquitetura

A plataforma estende o ciclo autoritativo existente, sem criar um segundo jogo ou uma segunda simulação:

- `SessionService` continua responsável por salas, slots, humanos, bots e retomada WebSocket. Slots autenticados agora conservam `userId` no servidor.
- `Match.result()` continua sendo a fonte única do resultado e da telemetria. Ele foi ampliado apenas com métricas que já podem ser medidas pelo servidor.
- `PlatformService` classifica e persiste a partida concluída.
- `RankingEngine` calcula Elo, atualiza os participantes, agrega estatísticas e grava o histórico.
- `AuthService` cuida exclusivamente de credenciais, sessões e perfil.
- `PlatformDatabase` centraliza SQLite, schema e migrations.

Uma conclusão válida executa esta sequência em uma única transação:

```text
Match autoritativo concluído
  → Match + MatchStatistics
  → RankedEvent processing
  → MatchPlayer de todos os participantes
  → PlayerRank + RankHistory
  → PlayerStatistics + Achievements
  → RankedEvent completed
```

Se qualquer participante falhar, toda a gravação é revertida. `external_id`,
`ranked_events.match_id` e `rank_history(match_id, player_id)` também impedem
duplicidade.

## Persistência e domínio

O schema versionado contém `users`, `auth_sessions`, `seasons`, `players`,
`matches`, `match_players`, `player_ranks`, `rank_history`,
`player_statistics`, `match_statistics`, `ranked_events`, `achievements` e
`player_achievements`.

Localmente, o arquivo padrão é `data/thornhold.sqlite`. Docker Compose cria um
volume nomeado. No Azure, o Bicep monta Azure Files em `/app/data`; por isso a
aplicação usa journal SQLite `DELETE` naquele ambiente e mantém `maxReplicas=1`.

Variáveis importantes:

| Variável | Padrão | Uso |
|---|---:|---|
| `DATABASE_PATH` | `data/thornhold.sqlite` | Arquivo persistente |
| `DATABASE_JOURNAL_MODE` | `WAL` | Use `DELETE` sobre Azure Files |
| `RANKED_SIMULATION_ENABLED` | `true` | Passa toda partida concluída pelo ranking simulado |
| `THORNHOLD_DEV` | `0` | Libera MMR e diagnóstico interno |

## Ranking

MMR e Rating começam em 1200. O algoritmo atual é Elo com K=32 e expectativa
calculada contra a média do time adversário. Vitória/derrota é o único sinal
competitivo; os seis scores analíticos não participam do cálculo. Limiares e
nomes dos tiers vivem em `shared/rank-config.js`.

Enquanto a simulação estiver ligada, partidas `pvp`, `bots`, `custom` e
`developer` são gravadas como `simulated_ranked` na **Temporada 0 —
Desenvolvimento**. Desligar a flag faz partidas normais/customizadas voltarem a
`unranked`; o modo explicitamente ranqueado continua `ranked`.

Bots usam IDs persistentes como `BOT_TROLL_ADAPTIVE_V1` e
`BOT_ELF_DEFENSIVE_V1`. Estratégia, versão e facção permanecem consultáveis no
leaderboard e no diagnóstico.

## HTTP API

Endpoints públicos:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/session`
- `GET /api/leaderboard`
- `GET /api/seasons`
- `GET /api/players/:playerId/profile`

Endpoints autenticados:

- `GET|PATCH /api/profile`
- `GET /api/ranked`
- `GET /api/matches`
- `GET /api/matches/:id`

Somente em desenvolvimento:

- `GET /api/ranked/debug`

Histórico é paginado; detalhes só podem ser abertos por um participante da
partida. Leaderboard aceita `page`, `pageSize`, `role=overall|troll|elf`,
`players=all|humans|bots` e `season=<id>|all`.

## Segurança

- Senhas usam `scrypt` com salt aleatório e comparação constante.
- O token de sessão é aleatório; somente seu hash SHA-256 fica no banco.
- Cookies são `HttpOnly`, `SameSite=Lax` e `Secure` em produção.
- Identidade, resultado, rating e estatísticas nunca são aceitos do cliente.
- Endpoints mutáveis rejeitam `Origin` diferente do host.
- Cadastro/login têm limite por IP e payload JSON tem limite de 32 KiB.
- Match Details aplica autorização por participante.
- Logs estruturados não incluem senha nem token.

## Interface

`client/platform.html` entrega autenticação, shell de perfil, visão geral,
histórico, detalhes, ranqueado, gráfico de rating, estatísticas, scores de
performance, conquistas, leaderboard e configurações de perfil. Humanos e bots
no leaderboard abrem perfis públicos com URL compartilhável, rank, estatísticas,
identidade competitiva e partidas recentes. E-mail, MMR e dados de sessão não
fazem parte desse contrato público. O menu principal restaura a sessão e mostra
o nome autenticado sem alterar o protocolo do jogo.

A interface diferencia visualmente os nove tiers, filtra o histórico no servidor
por papel, resultado e origem da partida, compara Rating antes/depois e usa os
checkpoints autoritativos para gráficos de economia, dano, estruturas e
progressão. Em desenvolvimento, o diagnóstico lista win rate, duração, rating
por papel e cada identidade de bot. Loading, vazio, sessão expirada, servidor
indisponível e falhas recuperáveis possuem estados separados.

## Limitações conhecidas

- Salas e partidas ativas não persistem após restart.
- SQLite + Azure Files é deliberadamente uma solução de alpha de uma réplica.
- Não existe recuperação de senha, verificação de e-mail, MFA ou OAuth.
- Não há matchmaking por MMR nem separação regional de filas.
- O histórico conserva a telemetria completa; retenção/compactação deverá ser
  definida antes de volume público relevante.
- Algumas médias avançadas só passam a existir para partidas gravadas na v0.4;
  dados legados recebem defaults seguros.

## Próximos passos recomendados

1. Backup automatizado e teste de restauração do arquivo de produção.
2. Recuperação/verificação de conta e política de privacidade/retenção.
3. Matchmaking por faixa de MMR quando houver população suficiente.
4. PostgreSQL antes de múltiplas réplicas ou regiões.
5. Painel operacional para retry de falhas e auditoria de temporadas.
