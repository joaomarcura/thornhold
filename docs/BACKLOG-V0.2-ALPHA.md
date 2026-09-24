# Thornhold v0.2 Alpha — backlog aprovado

Este documento é a fonte de verdade do produto para a primeira alpha por convite. Ele registra as decisões tomadas em 23–24/09/2026 e separa decisões de produto, implementação e critérios de avanço. Mudanças de escopo devem atualizar este arquivo no mesmo commit.

## Objetivo da alpha

- Convidar 50 jogadores e concluir pelo menos 100 partidas humanas.
- Manter disponibilidade da sessão acima de 99% durante a janela de teste.
- Operar inicialmente no Brasil, em uma única instância econômica na AWS.
- Aprender com partidas humanas antes de abrir acesso público ou distribuir o servidor.

Versão candidata: `0.2.0-alpha.1`. Cenário principal de balanceamento: um Troll contra cinco Elfos humanos, mapa compacto. O Troll deve vencer aproximadamente 55–60% das partidas ranqueadas, sem invulnerabilidade ou vitória decidida por relógio.

## Regras de produto aprovadas

### Partida e cooperação

- Não existe limite fixo de duração. Impasses são resolvidos pela progressão lendária e pelas condições normais de eliminação/base.
- Uma clareira comporta 1 Núcleo, 1 Barricada, 5 Torres, 5 Minas e 1 Oficina.
- Aliados podem construir e reparar na mesma clareira. Recursos, renda e propriedade continuam individuais.
- Uma estrutura pertence a quem pagou por ela. Somente o proprietário pode melhorar ou cancelar; não há transferência direta de recursos.
- Ao morrer, o Elfo perde recursos, Wisps e todas as suas estruturas. O colapso concede ao Troll 25% da recompensa normal e não devolve investimento.
- Uma clareira afetada pelo colapso pode ser reivindicada por outro Elfo após 15 segundos.

### Reparo, invasão e reassentamento

- A Barricada é reparada gratuitamente por uma habilidade canalizada; demais estruturas preservam o reparo pago.
- O primeiro Elfo repara na velocidade integral. Cada participante adicional contribui com 25% da velocidade-base.
- O stun élfico continua compartilhado, dura 3 segundos e libera quando a Barricada da própria clareira cai e o Troll invade.
- Cada Elfo possui um único voucher de reassentamento por partida. Durante a janela de 60 segundos após perder o Núcleo, o próximo Núcleo não consome recursos; o voucher não pode virar ouro ou madeira.

### Espírito

- Um Elfo eliminado retorna como espírito controlável, visível para todos e com as mesmas colisões de um Elfo.
- Não causa dano. Pode revelar uma área por 10 segundos a cada 60 segundos e reparar Barricadas a 50% da velocidade-base.
- Reparos de vários Elfos/espíritos obedecem ao mesmo retorno decrescente.
- O Troll pode matar o espírito. Isso concede pequena recompensa/pontuação, não conta como nova eliminação e transforma o jogador em observador pelo restante da partida.
- A vitória do Troll considera somente Elfos vivos; espíritos não impedem o fim da partida.

### Progressão lendária

- Apenas uma Torre Lendária pode existir por equipe. Qualquer Torre de um Elfo vivo pode ascender no Tier 10.
- A Torre Lendária usa um raio contínuo cujo dano aumenta enquanto mantém contato. Perder linha de visão interrompe o acúmulo.
- Se a Torre Lendária colapsar com seu dono, outro Elfo elegível pode criar uma nova.
- A Espada Lendária fica disponível quando a soma dos níveis de Dano e Cerco do Troll chega a 10.
- Qualquer golpe da Espada Lendária executa estruturas abaixo de 15% de HP.
- Lendárias criam vantagem extrema, mas não acionam vitória automática.

### Modos e ranking

- Normal: bots, salas privadas, públicas e personalizadas. Permite revanche e não altera MMR.
- Ranqueado: 1 Troll humano contra 5 Elfos humanos, mapa compacto, filas separadas por papel e sem espectadores.
- Troll entra sozinho; Elfos podem formar grupos de até cinco. Não há restrição de rank; o matchmaking usa o maior MMR do grupo.
- MMR é separado por papel, oculto e afetado apenas por vitória/derrota e força dos adversários.
- Cinco partidas de colocação por papel. Divisões visíveis de Ferro IV até Diamante I; Mestre, Grão-Mestre e Desafiante não têm subdivisões.
- Decaimento somente nos três ranks superiores. Temporadas duram aproximadamente dez semanas.
- Uma revanche ranqueada com os mesmos papéis é permitida e altera MMR normalmente.
- Após dez minutos, quatro dos cinco Elfos podem se render; o Troll pode desistir sozinho.
- Desconexão sempre ativa o bot substituto. Não há remake. Ausências repetidas recebem bloqueio de fila e perda progressiva de MMR.

### Conta e progressão

- Acesso por convite individual, de uso único e vinculado ao primeiro e-mail.
- Login sem senha por Cognito + SES. Nome público é único.
- Conta guarda perfil, histórico, MMR, divisões, nível, cosméticos e resultados.
- Progressão persistente é exclusivamente cosmética. Primeira entrega: cores de roupa, emblemas e títulos.
- Cosméticos não substituem as cores competitivas de contorno, mapa e UI.
- Recompensas são diretas por nível e temporada; não há compras na alpha.
- As três primeiras partidas diárias contra bots concedem progresso integral, as cinco seguintes 50% e as demais 20%.

### Comunicação, acessibilidade e administração

- Sem chat na alpha. A roda rápida oferece perigo, ajuda, atacar, defender, preciso de ouro, preciso de madeira e recuar.
- Português e inglês, desktop. Inclui remapeamento de teclas, escala de UI, modo daltônico e redução de movimento.
- O jogo oferece denúncia de jogador, bug e feedback.
- Painel administrativo cobre convites, contas, partidas, punições e métricas, protegido por conta separada e MFA.
- Telemetria detalhada permanece durante a alpha, pseudonimizada, com consentimento e exclusão ao apagar a conta.

### Operação

- Primeira implantação: instância Lightsail/EC2 na região de São Paulo, containers, PostgreSQL, backups no S3 e CloudWatch básico, buscando custo inferior a US$100/mês.
- Partidas e salas ativas não sobrevivem a reinício nesta fase; contas, resultados e progressão sobrevivem.
- Endereço técnico inicialmente; domínio será decidido depois.
- Observadores são desativados em partidas públicas. Visão completa permanece apenas em salas privadas confiáveis.

## Sequência de implementação

### Etapa 0 — consolidar e tornar reproduzível

- [x] `REL-001` Criar branch da alpha e registrar as melhorias existentes em commits temáticos.
- [x] `REL-002` Definir versão explícita e versões de protocolo, balanceamento e IA.
- [x] `REL-003` Criar `npm run verify` com sintaxe, regras/rede e fluxos críticos de navegador.
- [x] `REL-004` Executar a verificação em CI e preservar capturas como artefatos.
- [x] `REL-005` Gerar baseline pareada de 100 partidas com versão, hash do Git, hash de configuração e matriz de seeds.
- [x] `REL-006` Atualizar a documentação e marcar auditorias históricas que foram superadas.

### Etapa 1 — fechar o gameplay principal

- [ ] `GAME-101` Voucher único de reassentamento, com UI, IA e testes de abuso.
- [ ] `GAME-102` Propriedade individual e construção aliada com limites por clareira.
- [ ] `GAME-103` Cinco Minas por clareira, com custo e produção ligados ao tier do Núcleo.
- [ ] `GAME-104` Reparo gratuito de Barricada e contribuição decrescente.
- [ ] `GAME-105` Colapso do patrimônio, recompensa parcial e bloqueio de 15 segundos.
- [ ] `GAME-106` Espírito controlável, revelação, reparo, segunda morte e observação.
- [ ] `GAME-107` Remover o limite temporal e instrumentar impasses.
- [ ] `GAME-108` Torre e Espada Lendárias, feedback audiovisual, IA e contrajogo.
- [ ] `GAME-109` Roda de comunicação sem transferência de recursos.
- [ ] `GAME-110` Repetir 100 partidas pareadas e separar 1v1, 1v2, 1v5 e 1v8 por mapa/dificuldade.

Critério: zero estados sem saída, zero partidas automatizadas inacabadas, 1v5 próximo da meta e nenhuma configuração principal acima de 65% para um lado sem diagnóstico explícito.

### Etapa 2 — modos, identidade e acessibilidade

- [ ] `UX-201` Internacionalização PT-BR/EN sem strings de regra duplicadas.
- [ ] `UX-202` Remapeamento, escala de UI, daltonismo e redução de movimento.
- [ ] `MODE-203` Separar Normal, personalizado e Ranqueado no lobby.
- [ ] `MODE-204` Filas por papel, grupos élficos, rendição e revanche ranqueada.
- [ ] `MODE-205` MMR separado, colocações, divisões, temporada e decaimento.
- [ ] `COS-206` Nível de conta e primeiros cosméticos sem alterar identificação competitiva.

### Etapa 3 — conta e operação online

- [ ] `AUTH-301` Convites, Cognito/SES, nomes únicos e sessão de conta.
- [ ] `DATA-302` PostgreSQL para perfis, histórico, MMR, progressão, punições e consentimento.
- [ ] `OPS-303` Container de produção, TLS/WSS, backups, logs estruturados e métricas de tick.
- [ ] `OPS-304` Limites por IP, criação de salas, Quick Play e processamento assíncrono de senha.
- [ ] `OPS-305` Graceful shutdown, rotação de telemetria e política de rollback.
- [ ] `OPS-306` Testes de carga, desconexão e degradação para 50 jogadores.
- [ ] `ADMIN-307` Painel com MFA para convites, contas, partidas, punições e métricas.
- [ ] `TRUST-308` Denúncias, bugs e feedback dentro do jogo.

### Etapa 4 — alpha por convite

- [ ] Publicar staging e validar uma sessão interna prolongada.
- [ ] Convidar a primeira coorte e acompanhar partidas sem alterar balanceamento durante a sessão.
- [ ] Atingir 50 convidados, 100 partidas humanas e disponibilidade superior a 99%.
- [ ] Revisar retenção, duração, composição das filas, abandono, uso de habilidades e vontade de revanche.

## Princípios de implementação

1. Servidor continua autoritativo; o cliente envia intenções.
2. Humanos e bots usam as mesmas regras e preços.
3. Toda regra nova possui feedback, telemetria, teste unitário/rede e fluxo de navegador quando visível.
4. Balanceamento numérico é decidido por seeds pareadas e playtest humano, não por proteção artificial.
5. A primeira operação é um monólito modular. Serviços só serão separados quando métricas mostrarem a necessidade.
