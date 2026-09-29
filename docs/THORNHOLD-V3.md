# Thornhold V3 — Predator & Kingdom

A V3 separa a identidade emergente da partida das compras econômicas.

- Gold continua controlando atributos e equipamentos.
- XP aumenta o Troll Level sem consumir Gold.
- Cards definem a build particular daquela partida.
- A economia dos Elfos evoluirá para Economy, Defense e Technology nas entregas seguintes.

## V3.0 — Troll Cards

Implementado:

- Troll Levels 1–20;
- escolhas nos níveis 1, 3, 5, 7, 10, 13, 16 e 20;
- oferta determinística de três cartas sem repetição;
- raridades Common, Rare e Legendary, sem reroll ou moeda própria;
- 18 cartas com efeitos de sustain, mobilidade, cerco, controle e economia de objetivos;
- escolha automática por arquétipo para Trolls controlados por IA;
- HUD de Level/XP e modal de escolha;
- telemetria de ofertas escolhidas, nível, XP e cura gerada por Cards.

XP vem principalmente de dano real e destruição de estruturas. Kills ajudam, mas não são a principal fonte.

## Entregas seguintes

### V3.1 — Expanded Elf Bases

Implementado na primeira entrega:

- área útil ampliada lateralmente em aproximadamente 29–52%, conforme o perfil;
- portão, rota de aproximação, quantidade de árvores e limites de estruturas preservados;
- zonas explícitas de Frontline, Industrial e Core, com leitura visual sutil no terreno;
- bots posicionam Torres na Frontline, economia na zona Industrial e Núcleo na Core Zone;
- estruturas registram sua zona para diagnóstico e telemetria futura;
- geração, passagem única, rampas e posicionamento validados em mapas compacto e grande.

Ainda requer playtest humano para confirmar legibilidade, circulação e câmera durante cercos.

### Resolução da partida e variedade de rota

- toda partida termina aos 60:00 se nenhum lado vencer antes;
- no limite, vence a soma de pontos da equipe;
- empate exato favorece os Elfos, pois os defensores sustentaram a clareira até o fim;
- HUD e resultado mostram o limite e os dois placares de equipe;
- cada partida do servidor registra uma variante de rota, muda o lado inicial de busca do Troll e alterna patrulha horária/anti-horária nas revanches;
- a variante fica salva no resultado para reproduzir aberturas suspeitas.

### V3.2 — Elf Incremental

Primeira entrega implementada:

- Essência é o único recurso avançado e passa a ser produzida pelo Núcleo a partir do nível 4;
- cada clareira escolhe permanentemente Economia, Defesa ou Tecnologia;
- Economia aumenta em 12% a produção de ouro e madeira;
- Defesa aumenta em 15% a vida das estruturas e a eficiência de reparo;
- Tecnologia aumenta em 30% a produção de Essência, reduz em 20% o tempo de melhorias e reduz em 25% o custo avançado;
- melhorias Lendárias e Épicas agora exigem Essência, tornando o avanço tardio uma decisão separada de acumular ouro e madeira;
- bots escolhem a especialização coerente com sua personalidade;
- HUD, seleção do Núcleo, ferramentas dev e telemetria mostram produção, estoque, gasto e caminho escolhido;
- a Oficina foi aposentada das partidas novas; históricos antigos continuam legíveis.

Ainda precisa de calibração pareada para posicionar Lendário em 10–15 minutos e Épico em 20–30 minutos sem enfraquecer o early game.

### V3.3 — Balance Pass

> Nota atual: os itens abaixo registram os experimentos históricos da V3.3. A Pressão de Cerco foi removida integralmente do runtime em setembro de 2026; Siege Parity e o bônus explícito de final de partida permanecem.

Primeiro experimento implementado, focado exclusivamente no late game:

- níveis 1–9 permanecem intactos; vida e dano estrutural usam crescimento tardio separado a partir do nível 10;
- o bônus de vida da Barricada Lendária foi incorporado a uma transição suave, sem o antigo penhasco de 62%;
- a Torre Lendária começa acima da torre normal, mas acumula seu dano em uma janela mais longa e com teto menor;
- Pressão de Cerco passa a funcionar contra Barricadas Lendárias depois de 12 minutos, permanece entre investidas e reduz progressivamente o reparo;
- a renda tardia do Troll usa uma curva logarítmica limitada baseada na economia, bases maduras e estruturas lendárias dos Elfos;
- recompensas de objetivos consideram investimento, madeira, Essência e produção da estrutura destruída;
- o Siege Parity Index compara tempo de ruptura e sobrevivência, aparece nos checkpoints, cercos e estado final e orienta a escolha entre fortalezas sem revelar alvos desconhecidos;
- telemetria atualizada para `v3.3.1-late-parity-2`.

Validação do primeiro experimento:

- `THORNHOLD`: vitória do Troll em 12:24, sem falha de navegação e sem limite de tempo;
- mesmas 20 seeds da V3.2: limite de tempo caiu de 3 para 0, partidas acima de 25 minutos de 5 para 2 e p90 de 60:00 para 23:24;
- a taxa de vitória do Troll, porém, subiu de 70% para 90%; portanto esta curva resolve a estagnação, mas ainda não é candidata de produção;
- a combinação mais suspeita é Pressão de Cerco persistente + recompensa de objetivo escalável: o sucesso de cerco subiu de 38,5% para 50,6% e Gold de objetivos de 1,4k para 14,6k por partida;
- conforme o protocolo de balanceamento, não houve uma segunda alteração automática de parâmetros nem rodada de 100 seeds.

Ainda pendente: medir pick rate, win rate e cura por Card e preservar a resolução tardia sem amplificar o snowball do Troll.

### V3.3.1 — Contenção de snowball

- curvas tardias e Siege Parity da V3.3 foram preservados;
- recompensa baseada no investimento só é aplicada a estruturas Lendárias ou depois de 15 minutos ativos;
- Pressão de Cerco permanece persistente, mas caiu de 8 para 6 stacks e de 6% para 3% de dano/redução de reparo por stack;
- potência máxima da pressão caiu de +48% dano/-48% reparo para +18% dano/-18% reparo.

Validação pareada da V3.3.1 nas mesmas 20 seeds:

- vitória do Troll permaneceu em 90% (18–2), portanto o equilíbrio ainda não foi recuperado;
- mediana aumentou de 16:16 para 18:23 e p90 de 23:24 para 26:31;
- partidas no limite permaneceram em zero, mas partidas acima de 25 minutos subiram de 2 para 4;
- Gold médio de objetivos caiu de 14,6k para 12,8k e a seed `THORNHOLD` passou de 12:24 para 12:35;
- como o resultado não ficou claramente melhor, a rodada de 100 seeds não foi executada.

## Regra de balanceamento

Cards não escolhem o vencedor. Eles criam alternativas de build. Gold continua sendo a progressão controlável, e o resultado deve depender da capacidade do Troll de converter pressão em destruição antes de os Elfos converterem tempo em uma cidade de endgame.

### B15 — Forja física e retorno inicial

- a loja do Troll agora é a Forja Ancestral física dentro do Santuário;
- o servidor rejeita compra, evolução e troca de equipamento fora do alcance da Forja;
- `B` canaliza o retorno ao Santuário desde o início da caçada, sem o antigo desbloqueio tardio;
- o retorno continua interrompível por dano, dura 5 segundos e mantém recarga de 180 segundos;
- ao sair do Santuário depois do retorno, o Troll recebe o impulso curto já existente;
- a IA do Troll também precisa retornar ou caminhar até a Forja e só interrompe a pressão quando possui uma compra viável fora de combate.

### B16 — Fundação ofensiva e sustain

- os níveis fundamentais 1–4 de dano, cadência, vida, armadura e cerco passam a entregar mais poder por compra, sem repetir o mesmo aumento em toda a curva tardia;
- níveis de Vigor concedem 25% mais regeneração e o Santuário cura 0,8% da vida máxima por segundo fora de combate;
- o Âmbar vampírico oferece 8% de roubo de vida contra unidades e 3% contra estruturas, limitado a 2% da vida máxima por golpe;
- após cercos repetidamente fracassados, a IA passa a priorizar o Âmbar na próxima visita possível à Forja.
