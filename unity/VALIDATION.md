# Validação do primeiro corte Unity — 2026-10-04

Baseline do browser: `2fb6df3`, jogo `0.6.6-alpha.1`, protocolo 3. Nenhuma regra de gameplay foi alterada durante a criação do cliente.

## Executado

- `npm run release:check`: 377 testes, 377 aprovados, zero falhas; 130 arquivos JS passaram na verificação de sintaxe.
- `npm run unity:test`: os arquivos C# reais de transporte/store compilaram com .NET SDK 8.0.425 e Newtonsoft.Json 13.0.2. Paridade de deltas Node/C#, substituição dos eventos, remoção/reordenação de entidades, rejeição de lacuna e patch inválido, reset sem estado obsoleto e rejeição de WS remoto sem TLS passaram.
- Integração C# nativa contra servidor Node isolado: hello, lobby, ready/start, mapa, full snapshot, deltas, retomada de identidade e saída passaram para Elfo, Troll, observador e co-op. Co-op verificou os túneis do mapa.
- Editor Unity **6000.6.4f1**: importação/preparação e build Windows terminaram com código 0. URP **17.6.0**, DirectX 11 e Mono. Pacotes/Editor são oficiais, com lockfile e `.meta` versionados.
- O **executável Windows compilado** executou a cena real nos quatro modos e passou: mapa/modelos, deltas, movimentação autoritativa de Elfo/Troll, compra/atualização de upgrade do Troll na base, co-op e saída. Os testes usaram banco em memória e telemetria desligada; não interromperam partidas na porta 3000 nem alteraram Azure.
- Validação gráfica com **NVIDIA GeForce RTX 4070 Laptop GPU / DirectX 11**: capturas da câmera real em 1280×720 passaram nos quatro modos. Terreno, primitivas dos personagens e floresta instanciada foram inspecionados nas capturas. Primeiro teste de backbuffer oculto retornou preto; foi substituído por render request URP offscreen e teste que falha em imagem uniforme. A captura ocorre depois dos comandos de instancing.

## Não confundir com validação concluída

- Não foi jogada uma partida completa até o resultado no cliente Unity.
- Construção, reparo, pesca/venda, especialização, troca de câmera durante ataque e compra de todos os itens ainda precisam de teste manual completo no cliente; seus comandos reutilizam a implementação Node já testada. A compra básica do Troll foi verificada no smoke, não todo o catálogo.
- O teste gráfico offscreen não valida todo o HUD, experiência de mouse/foco ou performance sustentada. **144 FPS não está garantido**, e captura isolada não prova essa meta.
- Modelos, skins, animações, terreno costeiro detalhado e UI final ainda não foram portados. Este corte usa arte/interface provisórias.
- Login/ranking/coleção da conta ainda são acessados pelo browser; o cliente nativo entra como convidado.
- Não houve deploy Azure nem alteração da infraestrutura. O servidor atual pode continuar atendendo clientes browser e nativos pelo mesmo protocolo.

Artefatos gerados localmente, ignorados pelo Git: `artifacts/unity/*.log`, `capture-*.png` e `unity/Thornhold/Builds/Windows/`. Reproduzir pelos comandos no [guia](README.md).
