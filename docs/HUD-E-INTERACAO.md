# HUD e interação

Atualização de 22/09/2026. O foco é legibilidade durante a partida, Wisps reconhecíveis no cenário e ações rápidas com saída previsível. O jogo continua sendo um protótipo desktop com arte procedural; esta revisão não equivale a validação de usabilidade com jogadores.

## Hierarquia visual

- Recursos ocupam uma linha no canto superior. Vida fica embaixo à esquerda, comandos no centro e minimapa à direita.
- Ícones vetoriais próprios substituem símbolos desconexos. Molduras de bronze, superfícies escuras e verde de seiva distinguem ações, economia e estado.
- Instruções longas ficam no guia H. A barra conserva teclas e nomes; preços das construções ficam na descrição ao passar o mouse e no projeto, antes da confirmação.
- Estruturas saudáveis não recebem todas uma placa permanente. Seleção, dano, obra e melhoria justificam marcadores. Alertas da própria base e dos aliados não são duplicados.
- Um painel de seleção reúne ações e progresso. A loja recolhe elementos que ficariam parcialmente cobertos, mantendo a vida visível. Efeitos conservam o nome e o tempo restante; detalhes ficam na descrição.
- Dicas podem ser desligadas no menu da partida. Foco de teclado permanece visível, e atualizações de recursos preservam o botão focado, escolhas nos selects e posição de rolagem.

As decisões de contexto estável e retorno consistente se apoiam nas [diretrizes de navegação XAG 112](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/112) e de [contexto de interface XAG 114](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/114). A [XAG 101](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/101) orientou o uso de texto contrastante e instruções junto da ação. São referências de projeto; não foi feita uma auditoria formal de conformidade ou de acessibilidade integral.

## Wisps visíveis

O espírito orbita a árvore a 1,7 m do tronco, com núcleo luminoso, halo e pequenas partículas de rastro. A copa da árvore ocupada fica translúcida para permitir identificar o trabalhador. Não se adiciona uma luz dinâmica cara para cada Wisp.

Um marcador mostra produção, formação, evolução ou pausa e pode ser clicado. Ao passar o cursor, o marcador permanece estável para facilitar o clique. O painel oferece **Localizar**, evolução, troca de árvore e retorno ao núcleo. A seleção destaca a árvore vinculada. O mapa ampliado inclui os trabalhadores presentes no snapshot autorizado.

O Troll continua recebendo somente os Wisps que pode avistar. A apresentação não concede visão nova. Movimento reduzido desativa órbita/rastro e tremores; o espírito e os estados continuam visíveis.

## Comandos e cancelamento

| Situação | Fluxo |
|---|---|
| Interagir perto de algo | E; o aviso mostra a ação disponível |
| Gerenciar economia | N abre o núcleo; T forma Wisp; U evolui a seleção |
| Colocar uma construção | 1–5, apontar, clique/Enter; o projeto termina após confirmar |
| Colocar várias | Segurar Shift ao confirmar mantém o projeto |
| Desistir antes de confirmar | Esc ou botão direito; nenhum recurso gasto |
| Trocar árvore | Botão Trocar de árvore → marcador no cenário; Esc desiste sem transferir |
| Inspecionar o Wisp | Clique no marcador ou na lista → Localizar; C volta ao personagem |
| Fechar contexto | Esc/botão direito fecha ação, mapa, observação, loja ou seleção; Esc abre menu somente sem esses contextos |
| Navegar sem mouse | Tab percorre comandos com cursor livre; no modo de câmera, Tab libera o cursor |

Cancelar limpa movimento e ações repetidas; uma tecla ainda pressionada só volta a agir depois de ser solta e pressionada novamente. Uma seleção distante não impede E de encontrar um recurso próximo. Fechar um painel não cancela investimentos em andamento.

Obras, formação e melhorias têm um botão explícito de cancelamento. O servidor calcula `75% × custo × fração pendente`, arredondando para baixo. Só o dono vivo pode cancelar; é necessário estar perto do alvo ou, para Wisps, do núcleo. Dano no alvo bloqueia cancelamento por cinco segundos. Obras concluídas e operações já canceladas não devolvem recursos. Cancelar não conta como destruição pelo Troll. Transferências entre árvores não têm reembolso: custam tempo, sem cobrança de recursos.

## Verificação e limites

`tests/progression.test.js` verifica cancelamento de obra, formação e melhorias, devolução parcial, posse, distância, combate, conclusão e impossibilidade de reembolso duplicado. O total da suíte passou de 43 para **45 testes**.

`scripts/browser-hud.js` usa um servidor isolado com recursos/posições de fixture e executa as ações pela interface e pelo WebSocket reais. Verifica cancelamento, Esc sem desfazer compra, E contextual, U/T, árvore clicável, marcador do Wisp, foco preservado, Tab, botão direito, interrupção de tecla mantida, Shift para repetir, dicas opcionais e contenção do painel em 1280×720. Capturas de inspeção: `artifacts/hud-wisp-visible.png` e `artifacts/hud-1280.png`. Os roteiros anteriores cobrem câmera, mapa, combate, loja, construção física e sessão.

Os testes visuais atuais usam Chrome desktop. Contraste em diferentes monitores, tamanho de texto preferido por jogadores, daltonismo, outros navegadores, controle por gamepad e leitura integral por leitor de tela ainda precisam de validação específica. As curvas de balanceamento e a meta de duração não foram alteradas nesta revisão de interface.
