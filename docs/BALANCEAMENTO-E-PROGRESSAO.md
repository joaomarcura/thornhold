# Auditoria de balanceamento e progressão — 22/09/2026

> Registro histórico, anterior aos Wisps, equipamentos e progressão infinita. Os limites de nível, resultados e prioridades abaixo descrevem aquela versão. Regras e evidências atuais: [PROGRESSAO-INFINITA-E-COMBATE.md](PROGRESSAO-INFINITA-E-COMBATE.md). Os relatórios genéricos `balance.json` e `combat-audit.json` são regenerados com o código atual; os lotes de progressão nomeados preservam o histórico.

**Objetivo escolhido: partidas de 12–18 minutos, com fases bem marcadas.** A versão auditada ainda não atingia esse objetivo com consistência. O ciclo básico existia, mas a progressão terminava cedo, a IA dos Elfos tinha respostas limitadas e o fim da partida dependia demais de o Troll continuar procurando alvos. Aumentar os cronômetros sozinho piorou a vantagem do Troll no lote avaliado.

## O que a pesquisa do modo acrescenta

Há versões diferentes de Troll & Elves. Não existe uma tabela única de números que possamos copiar e esperar que funcione em terceira pessoa, com 1–8 Elfos.

- A [página do criador de Troll & Elves 2](https://steamcommunity.com/sharedfiles/filedetails/?id=687495832) descreve Elfos frágeis, construção econômica, defesa de entrada, torres, habilidades ativas, cooperação e ouro do Troll por dano. Também inclui participação após a morte, como anjo ou lobo. Nosso protótipo já reproduz parte do ciclo econômico; habilidades ativas dos Elfos e uma função relevante após eliminação estão faltando.
- O [guia do mantenedor da variante Warcraft III](https://www.hiveworkshop.com/threads/troll-vs-elves-v4-7-b5-5.207999/) descreve atacar uma base para financiar equipamento e voltar mais forte. Isso sustenta a importância de investidas, retirada e compras. Não adotamos a regra social dessa variante de preservar a muralha: aqui a ruptura é um objetivo explícito.
- O [criador de Troll vs Elves 4](https://steamcommunity.com/sharedfiles/filedetails/?id=2027812233) recomenda 10 ou mais jogadores. Essa escala é diferente da nossa. Suas [notas de atualização](https://steamcommunity.com/sharedfiles/filedetails/changelog/2027812233) incluem habilidades, indicadores de alcance, comunicação e mudanças de modos; a [página seguinte](https://steamcommunity.com/sharedfiles/filedetails/changelog/2027812233?p=2) registra ajustes de custos de progressão e trabalhadores. A referência é um sistema de decisões e informação, não apenas uma corrida de HP contra DPS.

Foram consultadas descrições e notas dos criadores/mantenedores, além do código e das simulações de Thornhold. Não houve acesso ao código completo atual do modo, análise de replays competitivos ou playtest humano dessas variantes. As propostas abaixo são decisões de projeto, não regras oficiais.

## Medição e limites

Três lotes pareados de **72 partidas**, totalizando **216 partidas simuladas**: duas escalas de mapa × 2/5/8 Elfos × IA dos Elfos normal/difícil × seis seeds `AUDIT-0` a `AUDIT-5`. Troll normal em todos os casos. Passo de **50 ms**, igual ao servidor; teto de observação de 25 minutos. Nenhum lado recebe atributos extras por dificuldade.

| Variante | Vitórias Troll / Elfos | Sem vencedor até 25 min | Mediana das concluídas | Dentro de 12–18 min |
|---|---:|---:|---:|---:|
| Antes da correção | 58 / 14 | 0 | 10:18,5 | 17/72 |
| Fome corrigida; valores atuais | 68 / 3 | 1 | 10:25 | 17/72 |
| Experimento: final 10:00, fome 15:00 | 72 / 0 | 0 | 10:55 | 22/72 |

As 14 derrotas originais terminaram por fome. Depois da correção, as três derrotas restantes também terminaram por fome; nenhuma terminou com um golpe de torre. Isso indica um problema na capacidade dos bots Elfos de converter defesa em vitória, não prova que humanos não consigam vencer com torres.

Medianas excluem a partida sem vencedor, que é registrada separadamente. Resultados agregados misturam tamanhos de lobby; seis seeds por combinação são poucas. Não interpretar estes percentuais como taxa de vitória humana ou equilíbrio competitivo. O primeiro diagnóstico usou 100 ms; ele foi substituído, para conclusões, por estes lotes a 20 Hz. A cadência de ações altera resultados.

### Tamanho da sala e mapa importam

Na versão corrigida, todas as 48 partidas com 2 ou 5 Elfos terminaram com vitória do Troll. Com 8 Elfos normais, foram 12/12; contra 8 difíceis, 8 vitórias do Troll, 3 dos Elfos e 1 sem vencedor. A escolha de torres e a frequência de decisões dos bots mudam com a dificuldade; não podemos atribuir tudo a atributos.

O primeiro contato, com dois Elfos, teve mediana próxima de **54 s no compacto e 244 s no grande**. Os bots ocupam clareiras em ordem fixa e o Troll explora sem consultar posições escondidas. Deslocamento e ocupação explicam parte do ritmo: multiplicar dano pela quantidade de Elfos não resolve isso.

## Problemas encontrados

### 1. Fome era tratada como ataque inimigo — corrigido

`Match.damage` renovava `lastHit` em qualquer dano. Fome mantinha a IA sob ameaça fictícia, prolongava exposição, gerava alerta de ataque e podia impedir a saída da retirada. Agora fome continua retirando vida e bloqueando regeneração por sua própria regra, sem renovar o relógio de ataque inimigo. Um acerto real de torre continua provocando reação defensiva.

Dois testes reproduziram a falha antes da correção e passam depois dela. A suíte completa passou com **32 testes**. A correção revela a vantagem dos bots Troll; não é apresentada como balanceamento concluído.

### 2. A progressão termina muito antes da partida

- Tier final libera aos **3:30**; fome começa a valer após **8:00**, quando há 45 s sem causar dano.
- No lote corrigido, o Troll comprou as 30 melhorias possíveis em **46/72 partidas**. Entre essas partidas, o primeiro caso completou a loja aos **6:07** e a mediana foi **8:39**.
- Na partida `AUDIT-4`, compacto, 8 Elfos difíceis, ainda havia quatro Elfos aos 25 minutos. Troll totalmente melhorado e com **9.457 de ouro**; Elfos sobreviventes com média de **19.855 de ouro**. O ouro acumulado já não se convertia em decisões suficientes.
- No experimento de cronômetros, a mediana para esgotar a loja entre os que conseguiram foi **10:05**: os recursos esperaram o desbloqueio e foram gastos em seguida. Um bloqueio por tempo não cria uma fase estratégica.

**Decisão:** rejeitar a mudança isolada para 10:00/15:00. Esses valores foram aplicados apenas na memória do processo de auditoria; não alteraram `shared/config.js` nem o servidor.

### 3. IA dos Elfos não usa plenamente suas ferramentas

O lote corrigido registrou **2.662 tentativas rejeitadas de reconstruir a barricada durante os 12 s de bloqueio**. Quando ela cai, o bot prioriza reconstrução, em vez de avaliar fuga e sobrevivência. Não houve o problema inicialmente suspeitado de repetir upgrades sem madeira.

O controlador constrói até quatro torres embora o limite seja cinco, só constrói uma mina embora o limite seja duas, e não melhora mina/oficina. Isso limita o significado de um resultado “Troll contra Elfos difíceis”. Também falta coordenação ativa: ajuda financeira, reparo em conjunto e resposta aos pedidos dos aliados existem como comandos, mas não como plano dos bots.

**Prioridade:** tratar invasão e saída do bloqueio antes de aumentar a vida de todas as construções. Usar visão autorizada, cooldown de reconstrução e posições alcançáveis; fugir não pode atravessar o Troll, rochas ou conhecer inimigos ocultos.

### 4. Retorno econômico favorece fortemente o núcleo

| Investimento | Ouro | Ganho de renda/s | Retorno marginal em ouro |
|---|---:|---:|---:|
| Núcleo 1 → 2 | 100 | 2,55 | 39,2 s |
| Núcleo 2 → 3 | 190 | 4,72 | 40,3 s |
| Núcleo 3 → 4 | 361 | 8,73 | 41,4 s |
| Nova mina | 85 | 1,30 | 65,4 s |
| Mina 1 → 2 | 110 | 0,91 | 120,9 s |

Retorno = custo em ouro / **aumento** de renda. Madeira, tempo de obra, deslocamento, espaço e risco são custos adicionais. Com espaço e limite disponíveis, a segunda mina tem retorno mais rápido que melhorar a primeira; após limites, a comparação muda. Não concluir que toda melhoria de mina é inútil.

**Proposta:** ajustar custos e crescimento conjuntamente para distribuir decisões até o fim, mostrar retorno e valores antes/depois no painel, e fazer mineração/oficina abrirem uma alternativa estratégica. A oficina hoje aumenta coleta em 30% e reparo em 20% por tier; ela ainda não é um centro de pesquisas. Transformá-la nisso exige implementação explícita.

### 5. Combate final estava subestimado na ferramenta antiga

A referência antiga comparava barricada tier 4 com Troll nível 3, omitia o máximo nível 4 e o multiplicador final de cerco. A ferramenta agora mostra os dois casos: barricada máxima de **5.382 HP**, Troll máximo com **379,8 DPS leve contra estruturas** após o marco final, aproximadamente **14,2 s** sem reparo. Esse número é contínuo, não duração garantida de cerco.

Foi acrescentada uma auditoria com **126 cenários usando o combate real do servidor**, incluindo recursos de reparo, oficina, armadura, exposição, ataques pesados e rugido. Em arena sintética, com cinco Rupturas tier 4 e oficina tier 4, o Troll máximo morreu em 13,2 s usando só ataques leves; com pesado e rugido disponíveis, rompeu em 15,15 s e restou com 12,5% de vida. Posição das torres fora do alcance do rugido pode mudar o resultado. Esse teste não simula uma clareira legal nem decisões humanas: isola as regras.

O Elfo precisa compreender e responder a essas janelas. Aumentar HP globalmente pode esconder o peso das habilidades e alongar os cercos sem adicionar escolhas.

### 6. Especializações precisam de identidade mais clara

No cálculo contínuo, Rajada tem cerca de **3,45% mais DPS** que Balista no mesmo alcance e custo, mas Balista causa mais dano por disparo. Disparos discretos, armadura e exposição podem inverter a ordem de um duelo; a auditoria não confirma dominância absoluta.

**Proposta a testar:** Balista com alcance/dano por disparo; Rajada com maior pressão perto da entrada e menor alcance; Gelo como controle; Ruptura contra armadura. Mostrar DPS, alcance e efeito no painel. Alterações de valores precisam passar pela matriz de combate e por partidas completas, não apenas por uma divisão dano/intervalo.

### 7. Falta um encerramento ativo do confronto

Fome pune falta de dano, mas um Troll que acerta periodicamente pode adiar o fim indefinidamente. A partida de 25 minutos comprova que ela não garante o ritmo desejado. Os Elfos defendem, mas não têm uma ação de captura, perseguição ou objetivo final para forçar a conclusão.

**Proposta:** objetivo final contestável que force os dois lados a agir e torne arriscado concentrar toda a equipe atrás de muros. Anunciar sua preparação, localização e tempo claramente. Não conceder vitória automática ao completar 18 minutos; a faixa é uma meta de partidas disputadas, não um bloqueio artificial contra vitórias antecipadas.

## Progressão proposta para 12–18 minutos

Os horários são metas de ritmo a validar, não mudanças já aplicadas nem cinco cadeados globais para compras.

| Fase | Janela | Escolha do Elfo | Escolha do Troll | Informação necessária |
|---|---|---|---|---|
| Preparação | 0–1 min | Escolher clareira, núcleo e entrada | Planejar rota inicial durante selo | Rota, custos iniciais, fim do selo |
| Primeiros contatos | 1–4 min | Renda ou primeira defesa; guardar recursos para reparar | Encontrar bases, obter ouro e escolher primeira especialização | Alerta de ataque, recompensa e progresso de compra |
| Disputa econômica | 4–9 min | Expansão, oficina/pesquisa ou torre de resposta | Trocar de base, investir em cerco ou sobrevivência | Antes/depois de upgrades e leitura das torres |
| Especialização final | 9–12 min | Preparar resposta ao equipamento observado | Completar uma estratégia; escolher o que deixar de comprar | Marcos alcançados e aviso do objetivo final |
| Confronto decisivo | 12–18 min | Defender e disputar o objetivo com aliados | Forçar ruptura ou impedir conclusão do objetivo | Contagem, progresso e condição de vitória dos dois lados |

Evitar uma loja em que o Troll compra tudo em sequência. Protótipo recomendado: orçamento finito de especializações/equipamentos, com trocas custosas e efeitos legíveis, preservando ouro principalmente por combate. Evitar crescimento infinito ou bônus escondido por dificuldade. Para os Elfos, começar com **uma** habilidade defensiva ativa de janela curta, com custo e cooldown visíveis; ela não deve reconstruir automaticamente uma entrada rompida nem apagar gratuitamente todo o dano.

## Ordem de implementação e critérios de aceitação

1. **Correção e medição — entregue:** fome, testes de regressão, métricas por papel, compras/renda ao longo do tempo, cenários de combate e comparação pareada.
2. **IA dos Elfos e combate legível:** reação à ruptura, quinta torre quando fizer sentido, decisões reais de mina/oficina, escolhas de especialização por ameaça observada. Aceitar quando cessarem as tentativas repetidas durante bloqueio e a sobrevivência decorrer de decisões legais, sem bônus de atributos.
3. **Economia e progressão:** curvas distribuídas, orçamento de especializações do Troll, oficina como pesquisa e uma habilidade ativa de Elfo. Testar separadamente economia, habilidades e torres para identificar qual mudança causa o efeito. Nenhum sistema novo está implementado nesta auditoria.
4. **Final e mapa:** objetivo contestável, opções de terreno mantendo uma única entrada, ocupação inicial menos previsível e ajuste específico por quantidade de Elfos. Há hoje pontos de interesse decorativos; não tratá-los como objetivos já funcionais. Rever também a proximidade inicial dos spawns: cerca de 22 m entre os pontos, dentro da visão nominal de 28 m do Troll.
5. **Playtests humanos:** meta inicial de mediana próxima de 15 min e maioria das partidas disputadas entre 12–18 min; reduzir tempos sem decisões, medir primeira eliminação e ouro sem uso. Acompanhar resultados separadamente em 1v2, 1v5 e 1v8 e por experiência. Não perseguir 50% de vitória compensando bots limitados com atributos artificiais.

Participação após a morte, trabalhadores automatizados, mais biomas e cosméticos ficam depois desse núcleo. Para quem morreu, uma função limitada de apoio da própria equipe é uma opção mais adequada a testar primeiro que copiar a troca de lado para lobo: as consequências para cooperação e eliminação precisam ser projetadas.

## Reproduzir e inspecionar

```powershell
npm test
npm run balance
npm run audit:combat
npm run audit:progression -- 6 artifacts/progression-current-20hz.json
npm run audit:progression -- 6 artifacts/progression-timers-only-20hz.json --timers-only
npm run audit:compare -- artifacts/progression-baseline-20hz.json artifacts/progression-hunger-fixed-20hz.json artifacts/progression-timers-only-20hz.json
```

`audit:progression` usa 20 Hz por padrão e retorna código 1 se alguma partida não terminar até o limite; o relatório ainda é gravado. O experimento modifica somente o processo que o executa. `audit:compare` valida seeds, configurações de participantes e passo pareados, sem contar partidas inconclusivas como derrota. Baseline anterior à correção é evidência preservada, não resultado que o código corrigido deva reproduzir.

Dados: [comparação](../artifacts/progression-comparison.json), [antes](../artifacts/progression-baseline-20hz.json), [corrigido](../artifacts/progression-hunger-fixed-20hz.json), [experimento rejeitado](../artifacts/progression-timers-only-20hz.json), [combate](../artifacts/combat-audit.json). Para as medianas consolidadas, usar a comparação: os primeiros dois relatórios brutos foram gerados por uma versão que apresentava a observação central superior em grupos pares; as linhas de partidas preservam os dados exatos e a comparação calcula a mediana corretamente.
