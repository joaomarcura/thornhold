# Progressão com cristal

Implementação local: `0.6.0-alpha.1`, balanceamento B26, IA A17, protocolo 3.
As decisões abaixo incorporam a correção final: madeira permanece nos custos
comuns; apenas a madeira coletável fora dos refúgios foi removida.

## Economia e mapa

- Construções e upgrades comuns continuam consumindo ouro e madeira.
- Cada Elfo começa com 100 cristais. O Troll começa com zero e não coleta cristal.
- A floresta decorativa permanece. As árvores coletáveis ficam dentro das bases;
  coleta manual e Wisps comuns continuam funcionando nelas.
- Mana, essência e minérios antigos não são fontes nem requisitos da nova partida.
- Bastião e Torre Arcana deixam de ser construções independentes. Seus conceitos
  passam a existir como especializações de Barricada e Torre, respectivamente.
- Dados antigos são conservados para ler partidas históricas; campos legados
  presentes nesses registros não reativam a progressão retirada.

## Marcos de cada construção

Núcleo, Mina, Torre e Barricada têm limite de nível 30 e escolhas independentes.

| Marco | Cristais | Regra |
| --- | ---: | --- |
| Nível 10 | 10 | Escolher um dos três ramos da construção. Sem escolha, não avança ao 11. |
| Upgrade 19 → 20 | 15 | Evolução Épica; mantém o ramo escolhido. |
| Upgrade 29 → 30 | 20 | Evolução final; mantém o ramo escolhido. |

O upgrade que cruza 20 ou 30 também paga seu custo comum em ouro e madeira.
A escolha inicial do ramo é separada do upgrade comum que chega ao nível 10.
O custo total de cristal para levar uma construção pelos três marcos é 45.
Quatro construções exigem 180: os 100 iniciais não completam esse conjunto sozinhos.
Uma base com duas Torres e duas Minas exige mais; perdas e reconstruções também
voltam a consumir os recursos necessários.

Somente o proprietário escolhe e paga, inclusive em co-op. O auxílio e reparo
aliados continuam seguindo as regras anteriores. Destruir a construção encerra
sua escolha; a reconstrução pode selecionar outro ramo.

## Ramos e efeitos reais

Os valores abaixo são do primeiro marco. Nos níveis 20 e 30, os bônus de ramo
são multiplicados por 1,4 e 1,8, sem acrescentar uma segunda curva exponencial.

| Construção | Ramo | Efeito no nível 10 |
| --- | --- | --- |
| Núcleo | Industrial | +15% de produção; habilidade Sobrecarga. |
| Núcleo | Fortaleza | −10% de dano recebido pelas estruturas da base; Fortificação. |
| Núcleo | Arcano | −15% de recarga da habilidade; Pulso Arcano nas torres comuns. |
| Mina | Extração intensiva | +20% de produção de ouro. |
| Mina | Mina fortificada | +10% de produção e +25% de vida máxima. |
| Mina | Logística de cristais | +10% de produção e coleta manual de cristal 25% mais rápida. |
| Torre | Balista | +20% de dano. |
| Torre | Rajada | +25% de cadência, incluindo o feixe Lendário. |
| Torre | Torre Arcana | +10% de dano, +2 m de alcance e 20% de penetração de armadura. |
| Barricada | Muralha reforçada | +20% de vida máxima. |
| Barricada | Bastião vivo | +35% de regeneração passiva e +20% de reparo recebido. |
| Barricada | Barreira rúnica | −15% de dano recebido. |

O bônus de coleta da Mina não acumula entre Minas: usa o maior bônus do dono.
As habilidades do Núcleo usam cooldown, não cristal. A lógica de combate
continua autoritativa no servidor, compartilhada por jogadores e bots.

## Ondas e coleta

As ondas surgem aos 15, 30 e 45 minutos do relógio da partida. O encerramento
permanece aos 60 minutos. Cada onda gera dez depósitos de 25 cristais, fora das
bases, em terreno acessível, com geração reproduzível pela seed.

Os depósitos persistem até esgotar. O mapa mostra esses objetivos públicos.
O Elfo aproxima-se, seleciona o cristal e mantém o clique esquerdo por três
segundos; Logística pode acelerar esse tempo. O primeiro a concluir recebe
todo o depósito. Movimento, dano, stun ou soltar o botão interrompem a coleta.
Wisps não coletam cristal automaticamente; Wisps especiais foram retirados.

## Bots, interface e telemetria

O diretor existente foi reaproveitado: defesa e evacuação vencem viagens de
recursos. Os bots escolhem ramos conforme a personalidade, reservam depósitos
distintos e canalizam usando o mesmo comando que o jogador. Sob ameaça,
abandonam a coleta. Núcleo, Barricada, Torre e Mina continuam progredindo com
limites de disparidade; o Projeto Épico reserva o próximo bloco, não todo o nível 20.

HUD, painel de construção, mapa, leaderboard, resultado e ferramentas DEV
exibem cristal. As construções recebem módulos visuais conforme o ramo.
A geração de depósitos ocorre por onda, não por frame; geometria/material
dos cristais são compartilhados e não há partículas contínuas de coleta.

A telemetria tem `resourceVersion: 2` e schema 23. Registra ondas, depósitos,
coletas/disputas, expedições, mortes em expedição, saldos, gastos, escolhas,
marcos e rejeições de upgrade. Perdas de cristal por eliminação são registradas
explicitamente nas novas partidas. Rejeições são tentativas de comando, não
uma medida completa de tempo de espera por recursos da IA.

## Validação desta entrega

- `npm run check`: 102 arquivos JavaScript válidos.
- `npm run test:fast`: 305 testes passaram; nenhum falhou.
- Quinze testes direcionados cobrem custos, propriedade, efeitos, limites,
  ondas, co-op, coleta, interrupções, disputa, IA, snapshot/delta e perdas.
- Uma partida real observada pelo navegador, 1 Troll × 5 Elfos, Normal/Normal,
  seed THORNHOLD, rota E26646-1-0-CCW, DEV x16, sem conceder recursos.
- Terminou aos 60:00 por pontuação, com vitória dos Elfos e quatro sobreviventes.
- Três ondas geraram 30 depósitos; os bots concluíram 13 coletas (325 cristais).
- Um Projeto Épico foi concluído, sem falha de projeto nessa partida.
- Maiores níveis: Núcleo 27, Barricada 27, Torre 27, Mina 26. Não houve nível 30.
- O navegador não registrou warnings ou erros durante a observação.

Essa partida comprova o fluxo funcional, não equilíbrio estatístico. Ainda
precisamos acompanhar o ritmo até nível 30, decisões humanas de coleta e
variação entre dificuldades. Não foram rodadas baterias de balanceamento
nem ajustados parâmetros automaticamente para obter 50/50.
O teste também não certifica 144 FPS nem carga com várias salas.

## Arquivos principais

- `shared/structure-specializations.js`: catálogo único, marcos e efeitos.
- `shared/crystals.js`: geração e canalização autoritativa.
- `shared/simulation.js`, `config.js`, `upgrade-rules.js`: comandos e custos.
- `shared/controllers.js`, `elf-team-director.js`: decisões e projeto dos bots.
- `shared/elf-progression.js`, `wisps.js`, `map.js`: habilidades e recursos locais.
- `shared/telemetry.js`: registros da nova economia.
- `client/main.js`, `selection.js`, `renderer.js`: interface e modelos.
- `tests/crystal-progression.test.js`: cobertura dedicada.

As mudanças permanecem locais. Esta entrega não faz commit, push ou deploy Azure.
