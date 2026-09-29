# Thornhold V3 — câmera, impacto e mundo

Esta etapa é deliberadamente visual e estrutural. O servidor continua autoritativo para movimento, combate, dano, economia, construção e resultados. Viewmodels, transições de câmera, áudio, partículas e feedback de progressão nunca calculam gameplay.

## Arquitetura

- `client/camera-mode.js`: funções puras para preferência, zoom e transição suave entre primeira e terceira pessoa.
- `client/viewmodel.js`: viewmodel reutilizável preso à câmera. Renderiza braço, arma ou ferramenta e aplica sway, bob, recoil e animação de golpe sem alterar hitbox.
- `client/renderer.js`: composição do mundo, câmera com colisão em terceira pessoa, efeitos, projéteis com velocidade por distância e atmosfera de cada mapa.
- `client/structure-visuals.js`: contrato independente entre nível autoritativo, faixa arquitetônica e progresso visual dentro da faixa. Nenhuma geometria altera colisão, HP ou alcance.
- `client/audio.js`: mixer persistente `master/music/sfx/ambient/ui`, música heroica, cama ambiente e resposta à proximidade do Troll.
- `shared/map.js`: gerador determinístico com arquétipos `woodland`, `deepForest` e `crossroads`. Todos passam pela mesma validação de portão único e pathfinding.
- `client/preferences.js`: preferência persistente de câmera e acessibilidade.

## Arquétipos iniciais

- **Bosque clássico**: topologia e densidade original; permanece o preset oficial.
- **Mata fechada**: corredores mais estreitos, mais cobertura visual, fog mais denso e leitura de curta distância.
- **Rotas abertas**: quatro conexões secundárias para rotações e perseguições, fog mais leve e menos cenário bloqueando leitura.

Seed, tamanho e arquétipo formam a identidade reproduzível do mapa. O arquétipo também é salvo na telemetria.

## Feedback implementado

- viewmodel diferente para Troll, coleta, trabalho e construção;
- golpe leve/pesado com recoil e screen shake graduado;
- projéteis com tempo por distância, rastro, cor por tipo e impacto;
- marcos visuais para nível do Troll, descoberta, estrutura Lendária, projeto Épico e vida crítica;
- presença do Troll por vinheta, dessaturação e camada ambiente, sem marcador vermelho obrigatório;
- mixer completo no menu Esc.

## Progressão visual de estruturas

Núcleo, Barricada, Torre, Mina, Oficina e estruturas de especialização usam
cinco famílias arquitetônicas claramente diferentes:

1. níveis 1–5: fundações de madeira e formas simples;
2. níveis 6–10: pedra fortificada e volumes mais sólidos;
3. níveis 11–15: engenharia metálica e mecanismos aparentes;
4. níveis 16–20: acabamento lendário, ouro e energia;
5. níveis 21–30: arquitetura ascendente, cristais e coroas energéticas.

Dentro de cada família, cada nível acrescenta módulos físicos próprios — como
reforços, ameias, chaminés, engrenagens, cristais ou coroas. Assim, dois níveis
da mesma faixa ainda são visualmente distinguíveis sem alterar a simulação.

Uma obra nova nasce em quatro etapas de montagem. O modelo aparece de baixo
para cima dentro de andaimes, com faíscas limitadas e um anel de progresso. Uma
melhoria usa o mesmo andaime sem esconder a estrutura existente. Ao concluir,
o evento autoritativo produz coroa de luz, pulso radial e partículas breves;
marcos Lendário, Épico e Ascendente têm feedback mais forte.

O servidor possui `maxStructureTier: 30`, separado de `maxTier: 20`. Essa
separação preserva o limite atual de Wisps e atributos do Troll. O nível 30
emite `advanced-structure` e aparece na telemetria sem introduzir bônus oculto.

## Troll, equipamento e Retorno

- o Troll recebeu mandíbula, presas, sobrancelhas, mãos e ombros mais legíveis;
- Machado de Cerco, Escopeta do Predador e Cajado Hemático possuem silhuetas
  próprias no mundo, inventário e viewmodel;
- a raridade acrescenta detalhes ao mesmo modelo equipado, sem trocar o item;
- o Retorno cria círculo rúnico, pulso, pilares de luz e feedback distinto para
  conclusão e cancelamento. O efeito reage aos eventos autoritativos existentes.

## Cenário

Os arquétipos agora também variam paleta do terreno. Vegetação rasteira usa
instancing e evita trilhas e clareiras; pontos de interesse ganharam silhuetas
próprias. Esses elementos são decorativos e não entram em pathfinding ou colisão.

## Limites de performance

- máximo de 72 projéteis visuais ativos;
- efeitos reutilizados por pool;
- cinco bases arquitetônicas por tipo, enriquecidas com pequenos módulos por nível;
- andaimes e celebrações existem somente durante a obra e são desativados depois;
- faíscas de construção têm cadência limitada e respeitam `Reduzir movimento`;
- vegetação rasteira instanciada e limitada a 420 elementos;
- partículas respeitam `Reduzir movimento`;
- resolução adaptativa existente permanece ativa;
- mapas continuam usando árvores e rochas instanciadas.

## Validação

Os testes cobrem a curva da câmera, categorias do mixer, progressão física em
cada nível, cinco silhuetas por estrutura, andaimes, persistência de regras de
lobby e conectividade das 12 bases nos três arquétipos. As fórmulas de dano,
HP, renda e IA não foram modificadas nesta etapa.
