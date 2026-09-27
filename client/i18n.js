const STORAGE_KEY='thornhold-locale';
const SUPPORTED=['pt-BR','en'];
const storedLocale=globalThis.localStorage?.getItem(STORAGE_KEY);
let locale=SUPPORTED.includes(storedLocale)?storedLocale:'pt-BR';

const EN=new Map(Object.entries({
  'A ÚLTIMA CLAREIRA':'THE LAST CLEARING','Erga seu refúgio.':'Raise your refuge.','Ou derrube todos.':'Or tear them all down.',
  'O anoitecer pertence ao Troll.':'Nightfall belongs to the Troll.','A floresta, a quem conseguir defendê-la.':'The forest belongs to those who can defend it.',
  'SEU NOME':'YOUR NAME','Seu nome':'Your name','Jogar contra bots':'Play against bots','Seu primeiro refúgio começa aqui':'Your first refuge starts here',
  'Criar sala privada':'Create private room','Entrar com código':'Join with code','Explorar partidas online':'Browse online matches',
  'Explore':'Explore','Fortifique':'Fortify','Sobreviva':'Survive','O BOSQUE DESPERTO':'THE WOODS AWAKEN','Um gigante.':'One giant.',
  'Doze possíveis refúgios.':'Twelve possible refuges.','MAPA PROCEDURAL · CADA SEED, UMA NOVA CAÇADA':'PROCEDURAL MAP · EVERY SEED, A NEW HUNT',
  'Como jogar':'How to play','Alterar idioma':'Change language','Acessibilidade ⚙':'Accessibility ⚙','Acessibilidade e controles':'Accessibility and controls','Desativar áudio':'Disable audio','Ativar áudio':'Enable audio','Som ligado':'Sound on','Som desligado':'Sound off',
  'PREFERÊNCIAS LOCAIS':'LOCAL PREFERENCES','As opções são salvas neste navegador. Atalhos reservados: Esc, Enter, F3, F10 e 1–5.':'Options are saved in this browser. Reserved shortcuts: Esc, Enter, F3, F10, and 1–5.','ESCALA DA INTERFACE':'INTERFACE SCALE','Reduzir movimento e efeitos':'Reduce motion and effects','MOVIMENTO':'MOVEMENT','AÇÕES':'ACTIONS','INTERFACE':'INTERFACE','Restaurar padrões':'Restore defaults','Concluir':'Done','Pressione uma tecla…':'Press a key…',
  'Mover para frente':'Move forward','Mover para trás':'Move backward','Mover à esquerda':'Move left','Mover à direita':'Move right','Reparar / coletar / girar projeto':'Repair / gather / rotate blueprint','Reparar / girar projeto':'Repair / rotate blueprint','Golpe pesado':'Heavy strike','Habilidade':'Ability','Retorno ao Santuário':'Return to Sanctuary','Loja do Troll':'Troll shop','Voltar à câmera':'Return to camera','Formar Wisp':'Train Wisp','Comunicação':'Communication',
  'SERVIDOR ATIVO':'SERVER ONLINE','CONECTANDO':'CONNECTING','Servidor conectado':'Server connected','Conectando ao servidor…':'Connecting to server…',
  'UMA FLORESTA. DUAS FORMAS DE SOBREVIVER.':'ONE FOREST. TWO WAYS TO SURVIVE.','3D · PVP ASSIMÉTRICO':'3D · ASYMMETRIC PVP',
  '← Sair da sala':'← Leave room','Escolha seu lado. A floresta fará o resto.':'Choose your side. The forest will do the rest.',
  'CÓDIGO DE CONVITE':'INVITE CODE','Copiar link ↗':'Copy link ↗','O Troll':'The Troll','Os Elfos':'The Elves','CONTRA':'VERSUS','1 CAÇADOR':'1 HUNTER',
  'A expedição':'The expedition','MODO':'MODE','SEED DO MUNDO':'WORLD SEED','ELFOS':'ELVES','MAPA':'MAP','PREPARAÇÃO':'PREPARATION',
  'DIFICULDADE PADRÃO':'DEFAULT DIFFICULTY','IA assume desconexões':'AI takes over disconnects','Escolha livre de papel':'Free role selection',
  'Uma entrada. Uma chance.':'One entrance. One chance.','Cada clareira é validada pelo servidor para ter uma única passagem terrestre.':'Every clearing is server-validated to have exactly one land entrance.',
  'Todos a postos.':'Everyone is ready.','O host já pode iniciar a expedição.':'The host can now start the expedition.',
  'Marcar como pronto':'Ready up','✓ Estou pronto':'✓ Ready','Iniciar expedição':'Start expedition','Aguardando o host':'Waiting for host',
  'Bots usam os mesmos personagens, custos e habilidades.':'Bots use the same characters, costs, and abilities.','Observar partida':'Spectate match',
  'Ocupar':'Take slot','Slot fechado':'Closed slot','Slot disponível':'Available slot','VOCÊ':'YOU','IA · MESMAS REGRAS':'AI · SAME RULES',
  'PRONTO PARA JOGAR':'READY TO PLAY','AGUARDANDO READY':'NOT READY','Não entra na partida':'Will not join the match','O caçador da floresta':'The forest hunter',
  'Convide um amigo ou adicione IA':'Invite a friend or add AI','Pronto':'Ready','Não pronto':'Not ready','Remover bot':'Remove bot','Mover…':'Move…','Observador · Apenas bots':'Observer · Bots only','Observador inicia 1 Troll e os Elfos selecionados somente com IA. Use F10 no servidor dev para acelerar.':'Observer starts 1 Troll and the selected Elves using AI only. Use F10 on the dev server to speed up.',
  'Normal':'Normal','Personalizado':'Custom','Ranqueado':'Ranked','Fácil':'Easy','Difícil':'Hard','Compacto':'Compact','Amplo':'Large',
  'EXPEDIÇÕES EM REDE':'ONLINE EXPEDITIONS','Encontre sua clareira.':'Find your clearing.','Salas públicas deste servidor. Convites privados entram pelo código.':'Public rooms on this server. Join private invitations with their code.',
  'Jogar online · Normal →':'Play online · Normal →','REGIÃO':'REGION','Todas':'All','PING MÁXIMO':'MAXIMUM PING','Qualquer':'Any',
  'Apenas vagas disponíveis':'Only rooms with open slots','↻ Atualizar':'↻ Refresh','+ Criar sala pública':'+ Create public room','SALA':'ROOM','JOGADORES':'PLAYERS',
  'REGIÃO / PING':'REGION / PING','ESTADO':'STATUS','Aguardando':'Waiting','Em partida':'In match','Entrar →':'Join →','← Voltar ao início':'← Back to home',
  'A floresta ainda está silenciosa.':'The forest is still quiet.','Crie a primeira sala ou use o modo Normal para preparar uma expedição.':'Create the first room or use Normal mode to prepare an expedition.',
  'O ping mede a conexão real com este servidor. Para jogar pela internet, os amigos devem abrir o endereço público do mesmo servidor.':'Ping measures the real connection to this server. To play online, friends must open this server’s public address.',
  'PREPARANDO A EXPEDIÇÃO':'PREPARING THE EXPEDITION','A floresta toma forma.':'The forest takes shape.','Gerando terreno, validando passagens e sincronizando jogadores.':'Generating terrain, validating paths, and synchronizing players.',
  'GUARDIÃO DA CLAREIRA':'KEEPER OF THE CLEARING','O SELO CAI EM':'THE SEAL BREAKS IN','A CAÇADA COMEÇOU':'THE HUNT HAS BEGUN','EXPEDIÇÃO':'EXPEDITION',
  'Abrir menu':'Open menu','Abrir menu dev':'Open dev menu','SUA BASE ESTÁ SOB ATAQUE':'YOUR BASE IS UNDER ATTACK','VITALIDADE':'VITALITY',
  'VISÃO DA EQUIPE':'TEAM VISION','AMPLIAR MAPA':'EXPAND MAP','PLACAR AO VIVO':'LIVE SCOREBOARD','PONTOS':'POINTS','Próximo':'Next',
  'Núcleo':'Core','Barricada':'Barricade','Torre':'Tower','Mina':'Mine','Oficina':'Workshop','Atordoar':'Stun','Golpe':'Strike','Pesado':'Heavy',
  'Esquiva':'Dodge','Rugido':'Roar','Melhorias':'Upgrades','Revelar':'Reveal','Reparar':'Repair','GRÁTIS':'FREE','NÚCLEO':'CORE',
  'Ouro':'Gold','Madeira':'Wood','Observando':'Spectating','Clique no cenário para jogar':'Click the world to play','pronto':'ready','Pausado':'Paused',
  'Mapa tático':'Tactical map','Guia de comandos':'Command guide','Mira central':'Center reticle','Alertas da equipe':'Team alerts',
  'VISÃO COMPARTILHADA':'SHARED VISION','Mapa da expedição':'Expedition map','Fechar mapa':'Close map','Você':'You','Aliado':'Ally','Última visão':'Last seen',
  'Perigo':'Danger','Ajuda':'Help','Atenção':'Attention','Atacar':'Attack','Defender':'Defend','COMUNICAÇÃO':'COMMUNICATION',
  'ENTRADA ROMPIDA':'ENTRANCE BREACHED','ATORDOADO · 3s':'STUNNED · 3s','DESTRUÍDA':'DESTROYED','CONCLUÍDA':'COMPLETED','− recurso':'− resource',
  'A FLORESTA SE CURVOU':'THE FOREST BOWED','A CLAREIRA RESISTIU':'THE CLEARING HELD','Vitória do Troll.':'Troll victory.','Vitória dos Elfos.':'Elf victory.',
  'MVP DA PARTIDA':'MATCH MVP','DURAÇÃO':'DURATION','ELIMINAÇÕES':'ELIMINATIONS','BASES ROMPIDAS':'BASES BREACHED','MELHORIAS':'UPGRADES',
  'Jogador':'Player','Status':'Status','Pontos':'Score','Dano':'Damage','Recursos':'Resources','Obras':'Structures','Upgrades':'Upgrades','Stuns':'Stuns',
  'Dano do Troll':'Troll damage','Dano das torres':'Tower damage','Ouro produzido':'Gold produced','Maior renda':'Highest income','Madeira produzida':'Wood produced',
  'Estruturas destruídas':'Structures destroyed','Núcleos destruídos':'Cores destroyed','Torres destruídas':'Towers destroyed','Elfos sobreviventes':'Surviving Elves',
  'Revanche · voltar ao lobby →':'Rematch · return to lobby →','Sair':'Leave','GUIA DE CAMPO':'FIELD GUIDE','Sobreviver é uma escolha.':'Survival is a choice.',
  'Como Elfo':'As an Elf','Como Troll':'As the Troll','Mover':'Move','Correr':'Run','Girar câmera e mirar':'Turn camera and aim','Mapa tático':'Tactical map',
  'Voltar ao personagem':'Return to character','Zoom':'Zoom','Cancelar / menu':'Cancel / menu','Entendido. Vamos à floresta.':'Understood. Into the forest.',
  'EXPEDIÇÃO EM ANDAMENTO':'EXPEDITION IN PROGRESS','Menu da partida':'Match menu','A partida online continua enquanto este menu está aberto.':'The online match continues while this menu is open.',
  'Continuar':'Continue','Dicas de comandos':'Command hints','Sair da partida':'Leave match','FERRAMENTAS DE DESENVOLVIMENTO':'DEVELOPMENT TOOLS',
  'Modo dev':'Dev mode','RECURSOS':'RESOURCES','VELOCIDADE':'SPEED','Combate: visível':'Combat: visible','Combate: oculto':'Combat: hidden','Fechar':'Close',
  'UMA FLORESTA ENTRE AMIGOS':'A FOREST AMONG FRIENDS','Entre na expedição.':'Join the expedition.','CÓDIGO DA SALA':'ROOM CODE','SENHA, SE NECESSÁRIO':'PASSWORD, IF REQUIRED',
  'Sala sem senha':'Room without password','Entrar na sala →':'Join room →','O código é válido no servidor que você está acessando.':'The code is valid on the server you are accessing.',
  'VOCÊ E A FLORESTA':'YOU AND THE FOREST','ABERTA A VIAJANTES':'OPEN TO TRAVELERS','EXPEDIÇÃO ENTRE AMIGOS':'EXPEDITION AMONG FRIENDS','Seu primeiro refúgio.':'Your first refuge.',
  'Prepare a expedição.':'Prepare the expedition.','NOME DA SALA':'ROOM NAME','SEU PAPEL':'YOUR ROLE','QUANTOS ELFOS':'HOW MANY ELVES','DIFICULDADE DOS BOTS':'BOT DIFFICULTY',
  'SENHA OPCIONAL':'OPTIONAL PASSWORD','Sem senha':'No password','Preencher espaços com bots':'Fill empty slots with bots','Criar partida local →':'Create local match →','Criar sala →':'Create room →',
  'Árvore de seiva':'Sap tree','BOSQUE EXTERNO':'OUTER GROVE','CLAREIRA':'CLEARING','Coletar':'Gather','Segure E para continuar.':'Hold E to continue.','Aproxime-se para coletar.':'Move closer to gather.',
  'ESPÍRITO':'SPIRIT','ELFO':'ELF','Torre Lendária':'Legendary Tower','SUA BASE':'YOUR BASE','INIMIGO':'ENEMY','ALIADO':'ALLY','Nível':'Level','Construção':'Construction',
  'Próxima melhoria':'Next upgrade','Produção':'Production','Ritmo':'Rate','Núcleo vinculado':'Linked Core','Alcance':'Range','Intervalo':'Interval',
  'Permaneça perto para concluir.':'Stay nearby to finish.','Aproxime-se para continuar a obra.':'Move closer to continue construction.','Ajudar':'Assist','Melhoria disponível':'Upgrade available',
  'ESPECIALIZAÇÃO':'SPECIALIZATION','Aproxime-se para gerenciar.':'Move closer to manage.','Primeiro reparador: 100% · ajudantes simultâneos: 25%.':'First repairer: 100% · simultaneous helpers: 25%.',
  'Raio contínuo · dano cresce até 4× enquanto mantém linha de visão.':'Continuous beam · damage grows up to 4× while line of sight is maintained.',
  'Selecionar Wisp':'Select Wisp','Formar Wisp':'Train Wisp','Colhendo sem consumir a árvore.':'Harvesting without consuming the tree.','Sem núcleo ativo no alcance.':'No active Core in range.',
  'Wisp da seiva':'Sap Wisp','Localizar na árvore':'Locate at tree','Evoluir':'Upgrade','Trocar de árvore':'Change tree','Escolher pela lista':'Choose from list',
  'Árvore de destino':'Destination tree','Externa +60%':'Outer +60%','Clareira':'Clearing','Vincular árvore selecionada':'Link selected tree','← Núcleo':'← Core','Vincular':'Link',
  'Fechar seleção':'Close selection','Esc ou botão direito':'Esc or right click','Arma':'Weapon','Capacete':'Helmet','Armadura':'Armor','Botas':'Boots','Proteção':'Armor','Relíquia':'Relic','Espaço livre':'Empty slot',
  'ARSENAL DO BOSQUE':'FOREST ARSENAL','FORJA ANCESTRAL · SANTUÁRIO':'ANCESTRAL FORGE · SANCTUARY','Forja Ancestral':'Ancestral Forge','Arsenal':'Arsenal','Loja do Troll':'Troll shop','Equipamentos':'Equipment','Árvore de crescimento':'Growth tree','Atributos ∞':'Attributes ∞','Sugestões de build':'Build suggestions','Categorias de equipamento':'Equipment categories',
  'Marreta de cerco':'Siege Maul','Garras da caça':'Hunting Claws','Lâmina longa':'Long Blade','Machado do predador':'Predator Cleaver','Rompe-reinos':'Realm Breaker','Couraça de pedra':'Stone Carapace','Botas do vento':'Wind Boots',
  'Musgo vivo':'Living Moss','Totem do silêncio':'Silence Totem','Elmo da caça':'Hunt Helm','Coroa de âmbar':'Amber Crown','Elmo de guerra':'War Helm','Máscara ancestral':'Ancestral Mask','Peitoral do colosso':'Colossus Breastplate','Armadura do invasor':'Invader Armor','Casca ancestral':'Ancestral Bark','Botas do rastro':'Trail Boots','Grevas de guerra':'War Greaves','Passos da sombra':'Shadow Steps','Passos enraizados':'Rooted Steps','Cerco':'Siege','Caçador':'Hunter','Sustentação':'Sustain',
  'Machado Quebra-Muralha':'Wallbreaker Axe','Escopeta do Predador':'Predator Shotgun','Cajado Hemático':'Blood Staff','Elmo do Silêncio':'Silence Helm','Visor da Caçada':'Hunt Visor','Coroa de Âmbar Vivo':'Living Amber Crown','Couraça de Pedra':'Stone Carapace','Manto de Musgo Vivo':'Living Moss Mantle','Peitoral do Predador':'Predator Breastplate','Botas do Vendaval':'Gale Boots','Grevas de Demolição':'Demolition Greaves','Passos Enraizados':'Rooted Steps',
  'Comum':'Common','Incomum':'Uncommon','Raro':'Rare','Lendário':'Legendary','Épico':'Epic','Linhas de equipamento':'Equipment lines','Progressão de raridade':'Rarity progression','Comparação com o equipado':'Compare with equipped','Sem item':'No item','sem mudança':'no change','Próxima evolução':'Next evolution','Equipado':'Equipped',
  'Abra a entrada durante o silêncio das torres.':'Breach the entrance while the towers are silenced.','Esquive, acerte e reposicione rapidamente.':'Dodge, strike, and reposition quickly.',
  'Controle a distância e recupere-se entre investidas.':'Control distance and recover between assaults.','Equipar':'Equip','✓ Equipado':'✓ Equipped','Comprar':'Buy',
  'Em combate · aguarde 5s sem causar ou receber dano.':'In combat · wait 5s without dealing or taking damage.','4 espaços · 20 itens sem penalidades. Itens comprados ficam na coleção.':'4 slots · 20 penalty-free items. Purchased items remain in your collection.',
  'A evolução está disponível desde o início e continua sem teto de nível.':'Progression is available from the start and continues without a level cap.',
  'Lentidão':'Slow','Movimento −35%':'Movement −35%','Atordoado':'Stunned','Movimento e habilidades bloqueados':'Movement and abilities disabled','Movimento acelerado':'Accelerated movement',
  'Selo de preparação':'Preparation Seal','Aguarde a libertação':'Await release','Fome':'Hunger','Cause dano para encerrar':'Deal damage to end it','Regeneração bloqueada':'Regeneration blocked',
  'Evite receber dano':'Avoid taking damage','Regenerando':'Regenerating','Santuário ancestral':'Ancestral Sanctuary','Abertura da esquiva':'Dodge opening','Exposição':'Exposure','Rugido · desativada':'Roar · disabled','Torre não pode disparar':'Tower cannot fire',
  'Rajada':'Volley','Gelo':'Frost','Ruptura':'Breach','Balista':'Ballista','Dano Físico':'Physical Damage','Velocidade de Ataque':'Attack Speed','Velocidade de Movimento':'Movement Speed','Roubo de Vida':'Life Steal','Vida Máxima':'Maximum Health','Armadura':'Armor','Regeneração':'Regeneration','Dano Estrutural':'Structure Damage','Rugido e Esquiva':'Roar and Dodge',
  'Regras oficiais sem pontuação ranqueada.':'Official rules without ranked scoring.','O host controla mapa, lobby e regras.':'The host controls the map, lobby, and rules.','Preset competitivo; MMR será ativado na etapa de filas.':'Competitive preset; MMR will be enabled with matchmaking.',
  'Apenas Elfos cultivam Wisps.':'Only Elves cultivate Wisps.','Aproxime-se do seu núcleo concluído.':'Move closer to your completed Core.','Um Wisp já está sendo formado.':'A Wisp is already being trained.',
  'Nenhuma árvore livre no alcance do núcleo. Evolua seus Wisps ou aguarde o rebrote.':'No free tree in Core range. Upgrade your Wisps or wait for regrowth.','Recursos insuficientes para formar Wisp.':'Not enough resources to train a Wisp.',
  'Selecione um Wisp seu.':'Select one of your Wisps.','Gerencie Wisps perto do seu núcleo.':'Manage Wisps near your Core.','O Wisp está em formação ou evoluindo.':'The Wisp is training or upgrading.',
  'Recursos insuficientes para evoluir Wisp.':'Not enough resources to upgrade the Wisp.','Escolha uma árvore livre, visível e no alcance do núcleo.':'Choose a free, visible tree within Core range.',
  'A partida não está ativa.':'The match is not active.','Você foi eliminado.':'You were eliminated.','Estrutura destruída.':'Structure destroyed.','Conclua a construção primeiro.':'Finish construction first.',
  'Jogador inválido.':'Invalid player.','Quantidade dev inválida.':'Invalid dev amount.','Você foi eliminado. Acompanhe seus aliados.':'You were eliminated. Follow your allies.',
  'Como espírito, você pode revelar, reparar Barricadas e sinalizar.':'As a spirit, you can reveal, repair Barricades, and ping.','O selo ainda está ativo.':'The seal is still active.',
  'Construção inválida.':'Invalid construction.','Posição inválida.':'Invalid position.','Aproxime-se do local de construção.':'Move closer to the construction site.','Terreno bloqueado ou íngreme.':'Blocked or steep terrain.',
  'A fundação colide com a rocha.':'The foundation collides with rock.','Escolha uma área plana para a fundação.':'Choose a flat area for the foundation.','Posicione na passagem iluminada.':'Place it on the highlighted entrance.',
  'Construa dentro de uma clareira.':'Build inside a clearing.','O Troll está perto demais para erguer uma fundação.':'The Troll is too close to raise a foundation.','Você já possui um núcleo.':'You already have a Core.',
  'Esta clareira já pertence a outro Elfo.':'This clearing already belongs to another Elf.','Esta clareira precisa de um núcleo ativo.':'This clearing needs an active Core.','O proprietário desta clareira foi eliminado.':'The owner of this clearing was eliminated.',
  'Espaço ocupado por outra estrutura.':'Space occupied by another structure.','Um personagem está ocupando este espaço.':'A character is occupying this space.','Afaste-se um pouco da fundação.':'Move away from the foundation.',
  'Colete a árvore antes de construir aqui.':'Gather the tree before building here.','Apenas Elfos coletam madeira.':'Only Elves gather wood.','Aproxime-se de uma árvore.':'Move closer to a tree.',
  'Árvore vinculada a um Wisp. Colete outra árvore.':'Tree linked to a Wisp. Gather another tree.','Aproxime-se de uma estrutura aliada.':'Move closer to an allied structure.','Espíritos reparam apenas Barricadas.':'Spirits can only repair Barricades.',
  'Reparo requer 3 ouro e 1 madeira.':'Repair requires 3 gold and 1 wood.','Especialização inválida.':'Invalid specialization.','Melhoria inválida.':'Invalid upgrade.',
  'Ouro insuficiente.':'Not enough gold.','Equipamento inválido.':'Invalid equipment.','Compre o item primeiro.':'Buy the item first.','Elfos constroem defesas; não atacam.':'Elves build defenses; they do not attack.',
  'Disponível quando a caçada começar.':'Available when the hunt begins.','Disponível por 45s após sua Barricada ser rompida.':'Available for 45s after your Barricade is breached.','O Troll ainda não entrou na sua base.':'The Troll has not entered your base yet.',
  'Habilidade exclusiva de espíritos.':'Spirit-only ability.','Perigo aqui!':'Danger here!','Preciso de ajuda!':'I need help!','Atenção nesta posição.':'Watch this position!','Preciso de ouro!':'I need gold!','Preciso de madeira!':'I need wood!','Defendam esta clareira!':'Defend this clearing!','Ataquem este alvo!':'Attack this target!',
  'Encontre uma clareira, construa o Núcleo e feche a passagem com uma Barricada. Colete madeira, melhore a renda e posicione torres perto da entrada.':'Find a clearing, build a Core, and seal the entrance with a Barricade. Gather wood, improve your income, and place towers near the entrance.',
  'Clique em uma árvore ou estrutura para selecionar. Use E para coletar/construir e R para reparar. Após sua Barricada cair, aproxime-se do Troll e use F para atordoá-lo por 3 segundos e escapar. Se o Núcleo cair, você terá 60s para correr até outra clareira e fundar um novo refúgio. Selecione o núcleo para formar e evoluir Wisps: eles colhem madeira automaticamente, um por árvore.':'Click a tree or structure to select it. Use E to gather/build and R to repair. After your Barricade falls, approach the Troll and use F to stun it for 3 seconds and escape. If the Core falls, you have 60s to reach another clearing and establish a new refuge. Select the Core to train and upgrade Wisps: they harvest wood automatically, one per tree.',
  'Explore depois que o selo cair. Dano efetivo rende ouro. Escolha arma, proteção e relíquia na loja B; a aba Atributos permite evolução contínua. Torres punem exposição longa: recue e escolha seus alvos.':'Explore after the seal breaks. Effective damage earns gold. Choose a weapon, armor, and relic in the B shop; the Attributes tab allows continuous progression. Towers punish prolonged exposure: retreat and choose your targets.',
  'Q golpe pesado · Espaço esquiva · F rugido, que interrompe torres próximas. Três acertos leves no mesmo alvo fortalecem o terceiro. Esquive para cancelar a preparação e aproveite 1,2 s de abertura.':'Q heavy strike · Space dodge · F roar, which interrupts nearby towers. Three light hits on the same target empower the third. Dodge to cancel wind-up and use the 1.2 s opening.',
  'Liberar / prender cursor':'Release / capture cursor','Núcleo / Wisps':'Core / Wisps','Evoluir seleção':'Upgrade selection','Formar Wisp no núcleo':'Train Wisp at Core','Repetir construção':'Repeat construction','Cancelar / fechar seleção':'Cancel / close selection','Construções':'Structures','Girar projeto':'Rotate blueprint','Alternar snap':'Toggle snap','Stun defensivo do Elfo':'Elf defensive stun','Sinalizar aliados':'Ping allies','Trocar observado':'Change observed player',
  'Normal usa o preset oficial. Personalizado libera todas as regras. Ranqueado prepara as regras competitivas; MMR entra na etapa de filas.':'Normal uses the official preset. Custom unlocks all rules. Ranked prepares competitive rules; MMR arrives with matchmaking.','No lobby, apenas o modo Personalizado permite alterar as regras.':'Only Custom mode allows rule changes in the lobby.',
  'Observando a expedição. Pressione Tab para trocar de personagem.':'Spectating the expedition. Press Tab to change character.','ESPÍRITO · F revela a área por 10s · R repara Barricadas a 50% · evite o Troll.':'SPIRIT · F reveals the area for 10s · R repairs Barricades at 50% · avoid the Troll.',
  'Explore uma clareira pelas trilhas. Depois, pressione 1 para construir o núcleo.':'Explore a clearing along the trails. Then press 1 to build the Core.','Proteja a única entrada: pressione 2 e clique no portão iluminado.':'Protect the only entrance: press 2 and click the highlighted gate.',
  'O selo contém sua força. Os Elfos estão preparando seus refúgios.':'The seal contains your strength. The Elves are preparing their refuges.','Retorne ao círculo de pedras do Santuário para recuperar vida com segurança.':'Return to the Sanctuary stone circle to recover health safely.','Procure atividade nas clareiras. Ataque para ganhar ouro; B abre suas melhorias.':'Search for activity in the clearings. Attack to earn gold; B opens your upgrades.',
  'OBSERVADOR':'SPECTATOR','ESPÍRITO DA CLAREIRA':'SPIRIT OF THE CLEARING','TROLL DO BOSQUE':'FOREST TROLL','Todos os bots · Tab para alternar':'All bots · Tab to switch','A ÚLTIMA CAÇADA':'THE LAST HUNT','ERA DO CERCO':'SIEGE AGE','ESSÊNCIA':'ESSENCE','FORÇA ANCESTRAL':'ANCIENT STRENGTH','ATIVO':'ACTIVE',
  'Clique para observar a região →':'Click to view the area →','Voucher de reassentamento: sem custo':'Resettlement voucher: free','Custo, vagas e produção escalam com o Núcleo':'Cost, slots, and production scale with the Core','Disponível após sua Barricada ser rompida':'Available after your Barricade is breached',
  'fechar arsenal · A partida continua':'close arsenal · The match continues','construir ·':'build ·','repetir ·':'repeat ·','cancelar':'cancel','escolher árvore ·':'choose tree ·','mover ·':'move ·','correr':'run','coletar ·':'gather ·','reparar':'repair','mapa':'map',
  '+45% cerco e pesado +15%. Golpes 15% mais lentos; dano base −10%.':'+45% siege and +15% heavy strike. Attacks 15% slower; base damage −10%.','Golpes 18% mais rápidos; dano −10% e cerco −15%.':'Attacks 18% faster; damage −10% and siege −15%.','+0,8 m de alcance e +8% dano. Favorece controlar distância.':'+0.8 m range and +8% damage. Favors distance control.',
  '+4 armadura; movimento −8%.':'+4 armor; movement −8%.','+10% movimento; esquiva recarrega 25% antes; vida −10%.':'+10% movement; dodge recharges 25% faster; health −10%.','+45% regeneração; começa 1 s antes; armadura −2.':'+45% regeneration; starts 1 s sooner; armor −2.',
  'Rugido dura +1,25 s. Crie uma janela de cerco.':'Roar lasts +1.25 s. Create a siege window.','Primeiro acerto em 1,2 s após esquivar: +35% dano adicional.':'First hit within 1.2 s after dodging: +35% bonus damage.','Cura 4% do dano real a unidades; 1,5% a estruturas. Até 1% da vida por golpe.':'Heals 4% of actual damage to units; 1.5% to structures. Up to 1% health per hit.','Roubo de vida: 8% contra unidades e 3% contra estruturas. Até 2% da vida máxima por golpe.':'Life steal: 8% against units and 3% against structures. Up to 2% maximum health per hit.',
  'Mais dano por disparo':'More damage per shot','Disparos mais rápidos':'Faster shots','Reduz a velocidade do Troll':'Slows the Troll','Ignora armadura e amplia alcance':'Ignores armor and increases range','Dano; crescimento suave após nível 4':'Damage; smooth growth after level 4','Reduz intervalo; ganhos decrescentes':'Reduces interval; diminishing returns','Mais vida máxima':'More maximum health','Mais armadura':'More armor','Mais regeneração fora de combate':'More out-of-combat regeneration','Mais movimento; ganhos decrescentes':'More movement; diminishing returns','Mais dano a estruturas':'More structure damage','Rugido e esquiva; ganhos decrescentes':'Roar and dodge; diminishing returns'
  ,'❧ Como Elfo':'❧ As an Elf','♜ Como Troll':'♜ As the Troll','Encontre uma clareira, construa o':'Find a clearing and build the','e feche a passagem com uma':'and seal the entrance with a','. Colete madeira, melhore a renda e posicione torres perto da entrada.':'. Gather wood, improve income, and place towers near the entrance.'
  ,'Clique em uma árvore ou estrutura para selecionar. Use':'Click a tree or structure to select it. Use','para coletar/construir e':'to gather/build and','para reparar. Após sua Barricada cair, aproxime-se do Troll e use':'to repair. After your Barricade falls, approach the Troll and use','para atordoá-lo por 3 segundos e escapar. Se o Núcleo cair, você terá 60s para correr até outra clareira e fundar um novo refúgio. Selecione o núcleo para formar e evoluir Wisps: eles colhem madeira automaticamente, um por árvore.':'to stun it for 3 seconds and escape. If the Core falls, you have 60s to reach another clearing and establish a new refuge. Select the Core to train and upgrade Wisps: they harvest wood automatically, one per tree.'
  ,'Explore depois que o selo cair. Dano efetivo rende ouro. Escolha arma, proteção e relíquia na loja':'Explore after the seal breaks. Effective damage earns gold. Choose a weapon, armor, and relic in the','; a aba Atributos permite evolução contínua. Torres punem exposição longa: recue e escolha seus alvos.':' shop; the Attributes tab allows continuous progression. Towers punish prolonged exposure: retreat and choose your targets.'
  ,'golpe pesado ·':'heavy strike ·','esquiva ·':'dodge ·','rugido, que interrompe torres próximas. Três acertos leves no mesmo alvo fortalecem o terceiro. Esquive para cancelar a preparação e aproveite 1,2 s de abertura.':'roar, which interrupts nearby towers. Three light hits on the same target empower the third. Dodge to cancel wind-up and use the 1.2 s opening.'
  ,'Bolinha do mouse':'Middle mouse button','Shift + clique':'Shift + click','Botão direito':'Right click','Espaço':'Space'
  ,'Mantenha a mira central sobre uma árvore ou estrutura e clique para selecionar. Segure':'Keep the center reticle over a tree or structure and click to select it. Hold'
  ,'para coletar ou reparar. No Núcleo,':'to gather or repair. At the Core,'
  ,'forma um Wisp e o envia automaticamente à árvore livre mais próxima. Após sua Barricada cair, aproxime-se do Troll e use':'trains a Wisp and automatically sends it to the nearest free tree. After your Barricade falls, approach the Troll and use'
  ,'forma um Wisp e o envia automaticamente à árvore livre mais próxima. Selecione uma estrutura própria concluída e pressione':'trains a Wisp and automatically sends it to the nearest free tree. Select one of your completed structures and press'
  ,'para demoli-la com confirmação. Após sua Barricada cair, aproxime-se do Troll e use':'to demolish it after confirmation. After your Barricade falls, approach the Troll and use'
  ,'para atordoá-lo por 3 segundos e escapar.':'to stun it for 3 seconds and escape.'
  ,'Explore depois que o selo cair. Dano efetivo rende ouro. Abra o arsenal com':'Explore after the seal breaks. Effective damage earns gold. Open the arsenal with'
  ,'e opere-o pelo teclado: setas ou WASD navegam e Enter confirma.':'and operate it by keyboard: arrows or WASD navigate and Enter confirms.'
  ,'Explore depois que o selo cair. Dano efetivo rende ouro, mas compras e trocas só podem ser feitas presencialmente na':'Explore after the seal breaks. Effective damage earns gold, but purchases and equipment changes must be made at the'
  ,'do Santuário. Use':'in the Sanctuary. Use','para retornar e':'to return and','perto da Forja para abrir o arsenal.':'near the Forge to open the arsenal.'
  ,'rugido. Torres punem exposição longa; recue, cure-se e escolha seus alvos.':'roar. Towers punish prolonged exposure; retreat, heal, and choose your targets.'
  ,'Mira central sempre travada':'Center reticle always locked','Clique':'Click','Selecionar / agir':'Select / act','Formar Wisp automático':'Train Wisp automatically','Retornar ao Santuário':'Return to Sanctuary','Abrir Forja próxima':'Open nearby Forge','Demolir estrutura selecionada':'Demolish selected structure'
  ,'Melhorias não possuem bloqueio temporal. Estruturas e atributos evoluem até o nível 20: Lendário no 10 e Épico no 20.':'Upgrades have no time gate. Structures and attributes progress to level 20: Legendary at 10 and Epic at 20.'
  ,'Mira travada · clique para agir':'Aim locked · click to act','Clique no cenário para retomar a mira':'Click the world to resume locked aim'
  ,'Atributos · 20':'Attributes · 20','Lendário no nível 10 · Épico e limite máximo no nível 20.':'Legendary at level 10 · Epic and maximum level at 20.'
}));

const PATTERNS=[
  [/^(\d+) Elfo$/, '$1 Elf'],[/^(\d+) Elfos$/, '$1 Elves'],[/^(\d+) ELFOS · 12 REFÚGIOS$/, '$1 ELVES · 12 REFUGES'],
  [/^(\d+) participantes$/, '$1 participants'],[/^(\d+) eliminações$/, '$1 eliminations'],[/^(\d+) pontos$/, '$1 points'],
  [/^(\d+)s \+ ajuste por Elfos$/, '$1s + Elf adjustment'],[/^Dificuldade de (.+)$/, 'Difficulty for $1'],[/^Remover (.+)$/, 'Remove $1'],
  [/^Mover jogador para (.+) (\d+)$/, 'Move player to $1 $2'],[/^Wisp nível (\d+), (.+) madeira por segundo$/, 'Wisp level $1, $2 wood per second'],
  [/^Madeira: (.+)$/, 'Wood: $1'],[/^Ouro: (.+)$/, 'Gold: $1'],[/^(.+) sob ataque$/, '$1 under attack'],
  [/^(\d+) ms · Servidor conectado$/, '$1 ms · Server connected'],[/^Nível (\d+)$/, 'Level $1'],[/^NV\. (\d+)$/, 'LV. $1'],[/^NÍVEL (\d+) · (.+)$/, 'LEVEL $1 · $2'],
  [/^SUA BASE · NV\. (\d+)$/, 'YOUR BASE · LV. $1'],[/^INIMIGO · NV\. (\d+)$/, 'ENEMY · LV. $1'],[/^ALIADO · NV\. (\d+)$/, 'ALLY · LV. $1'],
  [/^Construindo · (.+)$/, 'Building · $1'],[/^Evoluindo · (.+)$/, 'Upgrading · $1'],[/^Formando · (.+)$/, 'Training · $1'],[/^Vinculando · (.+)$/, 'Linking · $1'],
  [/^(\d+) árvores livres$/, '$1 free trees'],[/^(\d+) árvores livres · evolua os atuais$/, '$1 free trees · upgrade current Wisps'],[/^Rebrote (.+) · aguarda espaço livre\.$/, 'Regrowth $1 · waiting for free space.'],
  [/^Evoluir: (.+) ouro \+ (.+) madeira$/, 'Upgrade: $1 gold + $2 wood'],[/^Próximo: (.+)$/, 'Next: $1'],[/^Cancelar formação (.+)$/, 'Cancel training $1'],[/^Cancelar obra (.+)$/, 'Cancel construction $1'],[/^Cancelar melhoria (.+)$/, 'Cancel upgrade $1'],
  [/^Aproxime-se: (.+) m \/ alcance (.+) m\.$/, 'Move closer: $1 m / range $2 m.'],[/^Melhoria em andamento: (.+)\.$/, 'Upgrade in progress: $1.'],
  [/^Ouro insuficiente: (.+)\.$/, 'Not enough gold: $1.'],[/^Madeira insuficiente: (.+)\.$/, 'Not enough wood: $1.'],[/^Núcleo nível (\d+) necessário para outra Mina\.$/, 'Core level $1 required for another Mine.'],
  [/^Proteção da equipe recarregando: (.+)\.$/, 'Team protection recharging: $1.'],[/^Revelação recarregando por (.+)\.$/, 'Reveal recharging for $1.'],
  [/^\+(.*) vida\/s$/, '+$1 health/s'],[/^Próximo acerto \+(.*)% dano$/, 'Next hit +$1% damage'],[/^\+(.*)% dano · prazo sem novos acertos$/, '+$1% damage · time without new hits'],
  [/^Espada Lendária: Fúria \+ Quebra-fortaleza (.+)\.$/, 'Legendary Sword: Fury + Fortress Breaker $1.'],[/^Nv\. (\d+) → (\d+)$/, 'Lv. $1 → $2']
  ,[/^\+(.+) madeira · (.+)\/min$/, '+$1 wood · $2/min'],[/^\+(.+) ouro · (.+)\/min$/, '+$1 gold · $2/min'],
  [/^REASSENTAMENTO GRÁTIS · (.+) · Corra para outra clareira e construa um novo Núcleo\.$/, 'FREE RESETTLEMENT · $1 · Run to another clearing and build a new Core.'],
  [/^(.+) · (Recanto|Bosque|Clareira ampla), (\d+) árvores, (.+) m · Pressione 1 e coloque seu núcleo na clareira\.$/, '$1 · $2, $3 trees, $4 m · Press 1 and place your Core in the clearing.'],
  [/^Núcleo T(\d+) · Barricada T(\d+) · (\d+) torres\. Selecione o núcleo para formar Wisps e automatizar madeira\.$/, 'Core T$1 · Barricade T$2 · $3 towers. Select the Core to train Wisps and automate wood.'],
  [/^COMBO (.+) · terceiro acerto \+25%$/, 'COMBO $1 · third hit +25%'],[/^(.+): (\d+) ouro, (\d+) madeira$/, '$1: $2 gold, $3 wood'],
  [/^DESATIVADA (.+)$/, 'DISABLED $1'],[/^ATORDOADO (.+)$/, 'STUNNED $1'],[/^Vincular à árvore (.+)$/, 'Link to tree $1']
  ,[/^Melhorias não possuem bloqueio temporal\. O Núcleo exige uma Barricada ativa e acompanha metade de seu nível\. O Troll não perde vida por inatividade e recupera-se fora de combate\. Custos crescem e ganhos de velocidade diminuem\.$/, 'Upgrades have no time gate. The Core requires an active Barricade at half its level. The Troll never loses health from inactivity and recovers out of combat. Costs grow and speed gains diminish.']
  ,[/^Barricada nível (\d+) necessária — atual: nível (\d+)\.$/, 'Barricade level $1 required — current: level $2.'],[/^Barricada nível (\d+) necessária — atual: não construída\.$/, 'Barricade level $1 required — current: not built.']
];

export const getLocale=()=>locale;
export const localeCode=()=>locale==='en'?'en-US':'pt-BR';
export function setLocale(next){locale=SUPPORTED.includes(next)?next:'pt-BR';globalThis.localStorage?.setItem(STORAGE_KEY,locale);if(globalThis.document)document.documentElement.lang=locale;}
export function toggleLocale(){setLocale(locale==='en'?'pt-BR':'en');return locale;}
export function translateText(value){
  if(locale!=='en'||!value||!value.trim())return value;
  const leading=value.match(/^\s*/)?.[0]||'',trailing=value.match(/\s*$/)?.[0]||'',text=value.trim();
  let translated=EN.get(text);
  if(!translated)for(const[pattern,replacement]of PATTERNS)if(pattern.test(text)){translated=text.replace(pattern,replacement);break;}
  return leading+(translated||text)+trailing;
}
export function localize(root=document){
  document.documentElement.lang=locale;
  document.title=locale==='en'?'Thornhold — The Last Clearing':'Thornhold — A última clareira';
  const scope=root.nodeType===Node.ELEMENT_NODE||root.nodeType===Node.DOCUMENT_NODE?root:root.parentElement;if(!scope)return;
  const walker=document.createTreeWalker(scope,NodeFilter.SHOW_TEXT);for(let node=walker.nextNode();node;node=walker.nextNode())if(!node.parentElement?.closest('script,style,[data-no-i18n]')){const next=translateText(node.nodeValue);if(next!==node.nodeValue)node.nodeValue=next;}
  const elements=[...(scope.matches?.('[aria-label],[title],[placeholder]')?[scope]:[]),...(scope.querySelectorAll?.('[aria-label],[title],[placeholder]')||[])];for(const element of elements)for(const attr of ['aria-label','title','placeholder'])if(element.hasAttribute(attr))element.setAttribute(attr,translateText(element.getAttribute(attr)));
}
export function observeLocalization(){
  setLocale(locale);localize();
  new MutationObserver(records=>{if(locale!=='en')return;for(const record of records){if(record.type==='characterData')localize(record.target);else for(const node of record.addedNodes)localize(node);}}).observe(document.body,{subtree:true,childList:true,characterData:true});
}
