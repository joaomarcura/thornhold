# Equipamentos do Troll V2

## Modelo

Cada equipamento possui uma identidade estável:

- `slot`: arma, capacete, armadura ou botas;
- `line`: cerco, caçador ou sustentação;
- `art`: símbolo visual coerente com sua função;
- `description`: fantasia e uso esperado;
- `cost`: preço de aquisição;
- bônus autoritativos, sem atributos negativos.

O progresso do jogador fica separado em:

- `inventory`: itens adquiridos;
- `equipment`: um item ativo por slot;
- `itemLevels`: nível persistente de cada item adquirido;
- `levels`: árvore independente de habilidades e atributos base.

## Evolução

| Nível | Raridade | Potência relativa do bônus |
|---:|---|---:|
| 1 | Comum | 100% |
| 2 | Incomum | 118% |
| 3 | Raro | 138% |
| 4 | Lendário | 162% |
| 5 | Épico | 190% |

O custo cresce a cada estágio. Multiplicadores benéficos são ampliados a partir do valor neutro, enquanto reduções benéficas de intervalo ou cooldown continuam diminuindo. Nenhuma evolução introduz penalidade.

## Linhas

- **Cerco:** dano contra estruturas, ataque pesado, armadura e controle de torres. Arma principal: Machado Quebra-Muralha.
- **Caçador:** velocidade de ataque, movimento, esquiva e burst de abertura. Arma principal: Escopeta do Predador.
- **Sustentação:** regeneração, roubo de vida, vida máxima e combate prolongado. Arma principal: Cajado Hemático.

Bots compram primeiro os quatro itens da build escolhida. Para não abandonar a árvore de habilidades, liberam evoluções de equipamento gradualmente a cada quatro níveis base adquiridos.

## Interface

A loja usa duas páginas independentes:

1. **Equipamentos:** ficha com atributos finais do Troll, silhueta com quatro slots equipados, catálogo de cinco opções por slot, painel de inspeção, comparação autoritativa, raridade e evolução.
2. **Árvore de crescimento:** atributos e habilidades permanentes do Troll.

As cores de raridade são consistentes em badge, borda, progresso e preview. O item equipado recebe destaque próprio, sem depender apenas de cor.

Cada card mostra os modificadores efetivamente consumidos por `combatStats`, incluindo atributos especializados que não cabem no resumo principal: roubo de vida, limite de cura por golpe, regeneração, início antecipado de regeneração, alcance, abertura, Rugido, recarga da esquiva e dano estrutural. O painel de comparação mostra os atributos finais antes e depois de equipar, usando o estado autoritativo recebido do servidor.
