# Thornhold — auditoria de jogabilidade

**23/09/2026 · Revisão após as melhorias de HUD e interação.**

O jogo já entrega o ciclo de exploração, economia, cerco e vitória. O principal trabalho agora é dar ao Elfo respostas interessantes durante o confronto, transformar cooperação em uma estratégia praticável e ajustar o ritmo para que a partida aproveite seus sistemas. Acrescentar níveis ou itens, isoladamente, tem impacto menor.

Esta é uma auditoria de regras, código, referências e evidências existentes. As propostas estão separadas dos recursos implementados. Não houve alteração de balanceamento ou mecânicas nesta pesquisa.

## 1. Base da avaliação

- Código atual de simulação, IA, mapa, equipamentos, Wisps, cancelamento, seleção, controles e renderização.
- Documentação de HUD e inspeção das capturas existentes `hud-1280.png` e `hud-wisp-visible.png`. São capturas de testes com fixtures, não partidas humanas naturais.
- **45/45 testes de regras e rede executados e aprovados nesta revisão.** Os roteiros de navegador mencionados nos documentos anteriores não foram reexecutados aqui.
- Reanálise das **72 partidas** já gravadas em `progression-infinite-final-20hz.json`, de 22/09/2026. Não é um novo lote de balanceamento. A configuração `BALANCE` atual coincide com a gravada; o relatório antigo não contém hashes que comprovem identidade de todo o código.
- Verificações controladas com `Match.act`/`Match.step` para ocupação de clareira, habilidade do Elfo e recuperação sem renda; inspeção de 80 mapas gerados para oferta potencial de madeira externa.
- [Guia de referências verificadas](REFERENCIAS-TROLL-E-ELFOS.md), com versões, fontes e resultado da busca por uma wiki. **Não foi encontrada uma wiki pública completa e verificável do modo.**

Resultados derivados, método e hashes dos arquivos consultados: [gameplay-research-evidence-2026-09-23.json](../artifacts/gameplay-research-evidence-2026-09-23.json).

## 2. O que já avançou e deve ser preservado

| Área | Estado confirmado | Valor para quem joga |
|---|---|---|
| Economia | Núcleo, minas, coleta, Wisps evoluíveis, madeira externa | Permite investir em crescimento e assumir risco |
| Combate do Troll | Preparação do golpe, combo, pesado, esquiva, rugido e três espaços de equipamento | Oferece execução e escolhas de combate |
| Defesa | Barricada, cinco torres, quatro especializações, reparo e oficina | Dá instrumentos reais para defender uma base |
| Informação | Fog autorizado pelo servidor, alertas, última posição e pings | Sustenta exploração e decisões com informação incompleta |
| Interação revisada | E contextual, N/T/U, seleção estável, gestão visual de Wisps, Shift para construir novamente | Reduz etapas para executar as decisões existentes |
| Recuperação de erro | Cancelamento de investimentos pendentes com reembolso parcial e validação no servidor | Diminui a punição por um comando equivocado |
| Continuidade da sessão | Reconexão, bots, resultado e revanche | Permite repetir partidas e testar o ciclo completo |

As mudanças recentes de interface já estão reconhecidas. Não caberia repetir o diagnóstico antigo de Wisps difíceis de localizar ou ausência de cancelamento. Ainda há espaço para explicar melhor as consequências das compras e para introduzir os sistemas gradualmente.

## 3. O que os dados realmente mostram

Cada grupo reúne seis seeds com Elfos normais e as mesmas seis com Elfos difíceis. O Troll é normal. O tempo inclui preparação. Medianas de duração excluem partidas sem vencedor; estas continuam na coluna própria.

| Mapa e confronto | Vitórias Troll | Vitórias Elfos | Sem vencedor aos 25 min | Mediana das concluídas | Mediana do primeiro dano do Troll |
|---|---:|---:|---:|---:|---:|
| Compacto 1v2 | 12 | 0 | 0 | 4:30 | 0:53 |
| Compacto 1v5 | 10 | 2 | 0 | 7:00,5 | 0:59 |
| Compacto 1v8 | 3 | 9 | 0 | 7:28,5 | 1:05 |
| Amplo 1v2 | 4 | 8 | 0 | 8:03,5 | 4:03 |
| Amplo 1v5 | 8 | 4 | 0 | 9:30,5 | 1:08 |
| Amplo 1v8 | 1 | 9 | 2 | 6:39,5 | 1:14 |

No total: 38 vitórias do Troll, 32 dos Elfos, duas inconclusivas e somente **8/72 partidas na meta de 12–18 minutos**. A mediana das concluídas é 7:00,5. Seis derrotas do Troll vieram de fome.

A reanálise acrescenta:

- **Primeiro Elfo eliminado na mediana aos 2:03; 60/72 partidas tiveram eliminação de Elfo antes de três minutos.** A regra permite que um jogador deixe de atuar muito cedo.
- **27/72 partidas sem compra de equipamento pelo Troll.** Nas 12 de compacto 1v2, nenhuma compra de item, apesar de existirem compras de atributos. Isso limita o quanto esse lote avalia Cerco/Caçador/Sustentação.
- Entre as 45 partidas com compra de item, mediana do primeiro equipamento aos **5:29,6**. Não é uma meta recomendada nem uma média de todas as partidas.
- Entre os Elfos eliminados nas partidas concluídas, mediana de **3:05,8 até o fim**. É tempo sem controle de um personagem vivo, embora observação e pings continuem disponíveis.

Esses resultados descrevem bots e suas políticas de decisão. Não medem diversão, retenção ou equilíbrio entre humanos. A diferença entre mapa e quantidade de jogadores é grande demais para declarar equilíbrio pelo agregado 38 contra 32. O lote principal também não cobre 1v1, apesar de esse tamanho ser oferecido no lobby.

## 4. Problemas prioritários

### A. O Elfo tem pouca resposta ativa ao cerco — prioridade máxima

**Evidência:** as habilidades de ataque, esquiva e rugido são exclusivas do Troll. O Elfo constrói, coleta, repara, melhora e corre. Sob ataque, sua ação direta se concentra em manter reparo e administrar recursos. O teste de comando de esquiva como Elfo foi rejeitado pela regra atual.

**Impacto provável:** a decisão anterior de investimento pesa muito; durante a emergência, resta pouca execução capaz de mudar o resultado. É uma inferência de projeto a validar com jogadores.

**Primeiro experimento:** oferecer duas ferramentas simples: proteção curta de uma estrutura e reposicionamento do Elfo. Cada uma precisa de efeito visual, limite claro e resposta possível do Troll. A proteção deve salvar uma janela crítica sem sustentar imunidade contínua por revezamento de oito jogadores. O reposicionamento deve permitir fugir ou ajudar, com destino válido e restrições explícitas de terreno.

Começar com esses dois verbos; testar raízes/silêncio depois. Não adicionar quatro botões antes de comprovar que o primeiro confronto fica melhor. O catálogo histórico de habilidades está documentado em [R3/R4](REFERENCIAS-TROLL-E-ELFOS.md).

**Validar:** se o Elfo identifica a ameaça, escolhe quando responder, consegue desperdiçar a habilidade e entende por que ela funcionou ou falhou. Comparar o mesmo cerco com habilidade disponível e em recarga; incluir coordenação de vários Elfos.

### B. O início e a escala do lobby distorcem toda a partida — prioridade máxima

**Evidência:** 1v2 compacto teve primeiro dano perto de 53 s; 1v2 amplo, perto de 243 s. A geração mantém oito clareiras nos dois tamanhos e a IA ocupa bases em ordem determinada por seu índice. A mesma combinação de mapa e rota de busca concede janelas econômicas muito diferentes.

**Melhoria:** escolher **1v5 compacto como cenário de referência de desenvolvimento**, por ser o padrão atual, sem afirmar que já está equilibrado. Para salas menores, testar subsetores/clareiras jogáveis e trajetos adequados ao número de jogadores. Depois calibrar 1v2, 1v8 e 1v1 separadamente.

A decisão sobre quais regiões participam deve ser comunicada antes da partida. Ajustar preparo e rendas a partir do tempo real de encontro; evitar multiplicadores ocultos usados para compensar problemas de percurso. As estatísticas indicam associação entre escala e resultado, não isolam a causa.

**Validar:** tempo até núcleo, primeira defesa, encontro, primeira perda econômica, ruptura e morte. Uma vitória muito rápida pode ser legítima; não precisa ser proibida por cronômetro. O problema é virar o padrão sem oportunidade de resposta.

### C. Cooperação existe nos comandos, mas a base continua individual — prioridade alta

**Evidência:** `placement()` rejeita outro núcleo na clareira ocupada e exige que as demais construções pertençam ao dono do núcleo. Um aliado pode reparar e ajudar obras, mas não erguer sua torre ali. O botão de transferência envia sempre 25 ouro e 10 madeira juntos. Os bots Elfos não planejam doações, ajuda entre bases ou resposta coordenada aos pings.

**Melhoria:** testar hospedagem consentida para construir apoio em uma clareira aliada, preservando dono das estruturas e limites de equipe. Acrescentar pedido de recurso específico, envio separado de ouro/madeira e acesso ao aliado pelo alerta/painel de equipe. Dar à ajuda um custo de oportunidade real de deslocamento ou recarga.

**Validar:** um novato consegue receber apoio sem conhecer comandos; dois aliados não duplicam gratuitamente limites de defesa; a base conjunta não se torna a única estratégia viável. Adaptar a IA após definir a regra, para que os testes de bots consigam exercê-la.

### D. Perder economia pode retirar qualquer caminho de recuperação — prioridade alta

**Evidência:** perder o núcleo não mata automaticamente o Elfo. Ele pode construir outro se tiver recursos. Porém, sem núcleo/minas, com menos de 65 ouro e sem aliado capaz de ajudar, coleta e Wisps só fornecem madeira. Uma fixture com um Elfo vivo, zero ouro e nenhuma estrutura de renda permaneceu com zero ouro após 60 s. A inspeção das fontes de renda confirma a ausência de recuperação autônoma nesse estado.

**Melhoria:** testar uma saída limitada: núcleo de emergência uma vez por partida, auxílio a aliado que financie reconstrução ou conversão emergencial de recursos. Escolher uma solução, não empilhar todas. Ela deve exigir escapar e aceitar um atraso econômico; destruir a base precisa continuar recompensando o Troll.

**Validar:** o jogador sobrevivente entende seu próximo objetivo e tem caminho legal para voltar ao jogo. Medir quantas reconstruções realmente acontecem, seu custo e o tempo até voltar a contribuir. A frequência desse estado em partidas reais ainda não foi medida.

### E. O pós-morte interrompe participação muito cedo — prioridade alta

**Evidência:** personagem morto só conserva ping e observação da equipe; `act()` bloqueia os demais comandos. As torres remanescentes podem continuar disparando, mas o jogador não passa a controlar uma nova função. O lote registra eliminações precoces e minutos de espera.

**Melhoria:** prototipar primeiro um espírito aliado de apoio, com poucas ações, visão limitada e contribuição inferior à de um Elfo vivo. Separar claramente “eliminado da condição de vitória” de “ainda participando”. A alternativa de voltar do lado do Troll deve ser testada depois: ela pode recompensar morrer de propósito e acelerar a vantagem de quem já está vencendo.

**Validar:** continuar vivo permanece preferível; morrer não concede reconhecimento irrestrito; vários espíritos não mantêm proteção/controle permanente; a vitória continua legível. Referências históricas do pós-morte: [R1/R2/R4/R5](REFERENCIAS-TROLL-E-ELFOS.md).

### F. Progressão infinita prolonga compras, mas cria poucas mudanças de estratégia — prioridade alta

**Evidência:** cinco famílias de estruturas e quatro especializações de torre. Depois dos primeiros tiers, predominam aumentos numéricos. A oficina melhora coleta manual e reparo, sem pesquisas. Balista e Rajada compartilham alcance e custo; no cálculo contínuo, Rajada tem aproximadamente 3,45% mais DPS, embora isso não prove domínio em combate discreto.

O retorno marginal do núcleo muda bastante: I→II recupera o ouro em aproximadamente **39 s**; IV→V em **201 s**; X→XI em **450 s**. Esses cálculos excluem madeira, tempo de obra e risco. O painel de estruturas mostra custo e nível, mas não apresenta sistematicamente os ganhos antes/depois. Wisps e atributos do Troll já têm prévia e não devem perder essa informação.

**Melhoria:** transformar a oficina em uma escolha pequena e legível de especialização: fortificação, mobilidade/apoio ou economia externa. Fazer cada torre ocupar uma função distinta e apresentar ganho marginal de renda, dano, alcance ou reparo antes da compra. Manter níveis contínuos como gasto posterior, sem depender deles para criar a identidade de uma fase.

No Troll, verificar quando equipamento compensa frente a atributos. A build da IA é escolhida a partir da seed; a compra de itens depende de estar fora de combate. A ausência de compras em muitos jogos justifica rever essa política e o ritmo, não concluir que os nove itens são inúteis para humanos.

**Validar:** duas aberturas viáveis; escolhas mudam com informação observada; o jogador consegue explicar o que sua melhoria permite fazer. Não confundir quantidade de botões com quantidade de estratégias.

### G. O mapa oferece pouca variedade estrutural e expansão desigual — prioridade média

**Evidência:** oito clareiras com o mesmo formato básico, oito árvores internas em posições relativas fixas, variação de localização/decor e dois tamanhos. Os pontos de interesse são renderizados, mas não possuem regra de captura, recompensa ou interação na simulação.

Em **40 seeds por tamanho**, usando núcleo hipotético no centro de cada uma das 320 clareiras por tamanho, havia de **0 a 9 árvores ricas no raio de 25 m** no compacto e de **0 a 8** no amplo. Não havia nenhuma em 13/320 e 38/320 clareiras, respectivamente. Isso mede oferta geométrica potencial, antes de visão, posicionamento legal do núcleo e ocupação; não mede expansão garantida ou equilíbrio.

**Melhoria:** começar por três perfis de clareira reconhecíveis: proteção, espaço econômico e acesso a ajuda/recursos externos. Garantir uma oferta externa mínima quando expansão fizer parte da estratégia pretendida; depois introduzir variação. Usar pontos de interesse apenas quando tiverem função clara e comunicável.

**Validar:** escolha de local muda a estratégia; a seed não decide sozinha se expansão está disponível; o Troll possui rotas de pressão alternativas; o cenário mostra o que é barreira, decoração ou recurso.

### H. Há informação incorreta ou insuficiente para decidir — correção imediata de baixo escopo

**Discrepância confirmada no código:** o renderer cria o círculo de torre com raio de **17 m** e só muda posição/visibilidade. A simulação usa **19 m no Gelo e 22 m na Ruptura**. O círculo também não representa obstrução por terreno. A UI não pode fazer o jogador planejar cobertura com um alcance incorreto.

**Outros pontos:** informar efeito do próximo upgrade de estrutura, motivo de ação indisponível e risco de parar ao observar outra região. O indicador de Wisp e a estabilidade da seleção já foram melhorados. As capturas atuais mostram uma hierarquia visual mais organizada; tamanho de texto, câmera sob cerco e resposta em rede ainda precisam de teste com pessoas.

**Validar:** representação corresponde à regra por especialização e obstáculo; primeira partida ensina núcleo → entrada → torre → renda/Wisp → resposta ao ataque em situações reais. O guia H existente deve continuar disponível, acompanhado por instrução contextual curta.

## 5. Desfecho e identidade do jogo

Fome começa a valer após oito minutos e 45 s sem dano; acertar periodicamente renova a atividade. Portanto, não garante encerramento. As duas partidas inconclusivas do lote confirmam a limitação, mas não demonstram que um novo objetivo seja a única solução.

**Proposta posterior:** após melhorar cerco, recuperação e cooperação, testar um objetivo final contestável, como um ritual anunciado que exija exposição e possa ser interrompido. Primeiro comparar essa variante com a vitória atual por combate. Trata-se de uma proposta própria de Thornhold, não de uma mecânica original confirmada. A meta de 12–18 min é uma orientação de ritmo, não uma vitória automática aos 18 minutos.

Também merecem avaliação posterior: abrigo econômico do Troll, consumíveis, detecção/invisibilidade e unidades auxiliares. Cada adição precisa resolver um problema observado. A versão em terceira pessoa já demanda movimento, câmera e interação; importar toda a microgestão de um RTS pode tornar as tarefas existentes mais cansativas.

## 6. Ordem recomendada de trabalho

| Etapa | Entrega concreta | Critério para avançar |
|---|---|---|
| 1 — primeiro confronto | Corrigir alcance informado; proteção e reposicionamento do Elfo; tutorial contextual curto | Ambos os lados reconhecem a janela de ameaça e a resposta; nenhum encadeamento de imunidade permanente |
| 2 — economia e ritmo | Aberturas/rotas por tamanho de sala, momento do primeiro item, prévias de upgrade e recuperação econômica | Mais partidas permitem decisões de especialização; menos eliminações antes de conhecer as ferramentas |
| 3 — jogar em equipe | Pedidos e transferências melhores, apoio em clareira aliada, IA que usa essas regras | Cooperação acontece sem comunicação externa e tem custo/benefício identificável |
| 4 — permanecer envolvido | Espírito de apoio após morte | Participação continua e sobreviver ainda é a melhor opção |
| 5 — variedade estratégica | Pesquisas curtas, identidade de torres e perfis de clareira | Mais de uma estratégia eficaz e respostas compreensíveis a cada uma |
| 6 — conclusão | Experimento de objetivo final, se necessário | Menos impasses, encerramento compreensível e vitória disputável pelos dois lados |

As etapas podem compartilhar instrumentação, mas as regras devem ser comparadas em mudanças pequenas. A primeira entrega deve produzir **um cerco divertido e compreensível entre um Troll e um Elfo**, enquanto o restante da partida fornece contexto econômico e cooperação.

## 7. Como comprovar melhora

**Regras:** manter os testes atuais e acrescentar verificações apenas para novas invariantes: destino válido de mobilidade, recargas compartilhadas/antiencadeamento, posse de estruturas conjuntas, pós-morte e recuperação sem duplicação de recursos.

**Bots:** repetir seeds pareadas a 20 Hz e incluir 1v1, 1v2, 1v5 e 1v8. Separar mapa, dificuldade por papel e tipo de build. Garantir que a IA usa a mecânica nova antes de usar o resultado para julgar seu valor. Registrar inconclusivas explicitamente.

**Pessoas:** primeira rodada exploratória com 6–8 participantes, combinando novatos e familiarizados com os originais; alternar os dois papéis e comparar sessões com as mesmas condições. Essa amostra serve para encontrar problemas, não para estimar uma taxa de vitória competitiva confiável.

Medir e observar:

1. Tempo até primeiro núcleo, defesa, Wisp, contato, item, ruptura e eliminação de Elfo.
2. Tempo em deslocamento, reparo, gestão, combate e observação; distinguir espera planejada de inatividade sem opção.
3. Uso, acerto e desperdício das habilidades; compreensão da resposta possível.
4. Perdas econômicas, reconstruções, doações, assistência e sobrevivência depois da primeira ruptura.
5. Equipamentos e pesquisas realmente usados; decisões que deixam de ser automáticas.
6. Tempo sem personagem vivo, abandono e vontade de jogar revanche.
7. Duração e vitórias por grupo, latência de entrada até resposta e divergências entre efeitos visuais e regra.

Perguntas após cada sessão: “O que você tentou fazer?”, “O que impediu?”, “Por que perdeu esse confronto?” e “Qual escolha faria diferente?”. Uma melhoria de jogabilidade deve mudar essas respostas e o comportamento observado, além dos números da simulação.

## 8. Arquivos para a próxima implementação

| Responsabilidade | Arquivos |
|---|---|
| Habilidades, dano, vitória, posse, recuperação | `shared/simulation.js`, `shared/config.js` |
| Comportamento que exercita as regras | `shared/controllers.js`, `shared/troll-brain.js` |
| Economia e crescimento | `shared/wisps.js`, `shared/equipment.js`, `shared/jobs.js` |
| Estrutura espacial e oferta de recursos | `shared/map.js` |
| Informação, seleção e comandos | `client/selection.js`, `client/main.js`, `client/tactical-map.js` |
| Alcance, leitura do combate e câmera | `client/renderer.js` |
| Telemetria e experimentos pareados | `scripts/progression-audit.js`, `server/index.js` |

As conclusões refletem os arquivos registrados no JSON de evidências. Mudanças posteriores devem atualizar a comparação, preservando os relatórios anteriores para distinguir evolução real de alteração da amostra.
