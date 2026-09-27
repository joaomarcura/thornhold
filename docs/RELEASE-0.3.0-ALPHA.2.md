# Thornhold 0.3.0-alpha.2

Release candidata consolidada em 27 de setembro de 2026.

## Progresso consolidado

- Progressão V3 do Troll com nível, cartas, equipamentos, Forja física e árvore de crescimento.
- Progressão dos Elfos com especializações Industrial, Fortaleza e Arcana, tecnologias e recursos especiais.
- IA Élfica com perfis econômicos, equilibrados e defensivos, prioridades adaptativas e projeto de Torre Épica.
- IA do Troll com memória estratégica, recuperação, rotação de alvos e memória negativa de bases vazias.
- Partidas 1x5 somente com bots, observador com voo livre e velocidades DEV até 16x.
- Limite autoritativo de 60 minutos decidido por pontuação de equipe.
- Telemetria ampliada para economia, cerco, especializações, destruição estrutural, sustain e contexto da build.
- Pipeline de Container Apps com imagem imutável, OIDC, teste de carga, smoke remoto e rollback automático.

## Balanceamento desta candidata

- Ouro por dano contra Elfos permanece integral.
- Ouro por dano estrutural recebe retorno decrescente após 15 minutos ou Troll nível 10, com piso de 32%.
- A parcela escalável de recompensas estruturais usa o mesmo retorno decrescente; recompensas-base permanecem intactas.
- Crescimento de dano por melhoria do Troll foi reduzido em 12%, sem alterar o dano base.
- Duas Torres Lendárias ativas reduzem regeneração em combate e roubo de vida em 30%; três ou mais reduzem em 50%.
- Cura ativa, recuperação fora de combate e Santuário não são afetados por essa supressão.

## Interface

- Vida atual e máxima do Troll aparecem abaixo de seu nome no mundo.
- A seleção do Troll mostra atributos autoritativos de combate.
- O placar ao vivo mostra ouro e madeira respeitando a visibilidade entre equipes.
- A Forja preserva a navegação por mouse e a troca consistente entre português e inglês.

## Critérios de release

- Sintaxe validada.
- 233 testes automatizados e todos os fluxos de navegador aprovados.
- Carga equivalente a oito salas 1x5 aprovada com 48 conexões, tick p95 de 17,63 ms e zero mensagens descartadas.
- Teste visual local do nameplate e do placar concluído.
- Health check local e conteúdo servido verificados após reinício limpo.
