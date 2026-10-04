# Thornhold Unity — primeiro cliente nativo

Este é um **protótipo de integração jogável**, não a conversão gráfica completa do jogo. O browser continua disponível. A simulação autoritativa, bots, progressão, economia, pesca, co-op e persistência continuam no servidor Node existente. Unity apresenta o estado e envia os mesmos comandos; não calcula recompensas ou dano novamente.

## 1. Versão e ferramentas

O projeto foi criado e compilado com **Unity 6000.6.4f1**, a versão instalada nesta máquina, e **URP 17.6.0**, indicada pelo template oficial desse Editor. Preserve essa combinação para reproduzir o build. A sugestão inicial era 6.3 LTS; escolher uma versão LTS de produção será uma decisão separada, sem fazer downgrade automático do projeto.

Instale Windows Build Support. O primeiro build usa **Mono** para evitar exigir Visual Studio/C++ na primeira validação; a adoção de IL2CPP e seus pré-requisitos vem depois. Node.js 22+ é necessário para o servidor. Os testes externos C# requerem .NET SDK 8+; `THORNHOLD_DOTNET` pode apontar para um SDK local.

## 2. Iniciar o servidor atual

Na raiz do repositório:

```powershell
npm ci
npm run start:dev
```

Se a porta 3000 já estiver servindo a versão atual, não abra outro servidor. `http://localhost:3000/health` deve responder. Use `npm start` em produção; ferramentas DEV não devem ser expostas em produção.

## 3. Abrir no Editor

1. No Unity Hub, **Add → Add project from disk** e selecione `unity/Thornhold` (não a raiz do repositório).
2. Abra com `6000.6.4f1` e aguarde a importação dos pacotes oficiais.
3. A cena já está salva em `Assets/Thornhold/Scenes/Thornhold.unity`. Se precisar recriar a configuração, use **Thornhold → Prepare prototype**. Não modifica a simulação Node.
4. Abra essa cena, pressione **Play** e use a aba **Game**.
5. Mantenha `ws://localhost:3000`, digite seu nome e clique **Conectar**.
6. Escolha `elf`, `troll` ou `observer`, configure a dificuldade e crie uma sala com bots.
7. Clique **Estou pronto** e depois **Iniciar partida**.

Para co-op, use **Criar co-op com parceiro bot**. Esse fluxo reutiliza a regra atual do servidor, que cria a sala em dificuldade normal. O campo de dificuldade do fluxo comum não altera esse fluxo de party.

## 4. Jogar sem o Editor

Abra `unity/Thornhold/Builds/Windows/Thornhold.exe` e siga os mesmos passos de conexão. A pasta inteira acompanha o `.exe`; não copie só o executável. O build é um artefato gerado e não fica no Git.

## 5. Controles do protótipo

| Ação | Controle |
| --- | --- |
| Movimento / correr | WASD / Shift |
| Olhar / primeira-terceira pessoa | Mouse / V |
| Liberar mouse / menu / voltar | ESC ou G; botão Voltar; clique na área do jogo recaptura |
| Elfo: alternar martelo/vara | 1, após concluir Oficina |
| Barricada, Torre, Mina, Oficina, Núcleo | 2, 3, 4, 5, 6 |
| Prédio existente | Número envia upgrade remoto; Shift+número posiciona uma nova construção |
| Colocar / cancelar construção | Clique esquerdo na mira / direito |
| Coletar / reparar / ajudar obra | Segurar clique esquerdo mirando no alvo e dentro do alcance do servidor |
| Pescar / fisgar | Clique esquerdo para lançar, clique quando a boia afundar; movimento cancela |
| Elfo: stun / habilidade da especialização | F / E |
| Troll: ataque leve / pesado | Clique esquerdo / direito |
| Troll: esquiva / cura / rugido / recall | Espaço / Q / E / B |
| Troll: carta disponível fora de combate | 1, 2 ou 3 |
| Observador | Tab alterna personagens/voo; WASD, Espaço sobe, Ctrl desce, Shift acelera |

G abre o painel de compras/venda e upgrades. O servidor continua verificando distância da Oficina/Forja, dono, ouro, madeira, cristais, limites, cooldowns e requisitos. Uma rejeição aparece na mensagem de estado. A vara não precisa ser desequipada para vender.

## 6. Escopo real desta primeira versão

Já integrado: WebSocket nativo, hello/lobby/mapa, snapshots completos e deltas, reconexão com identidade, terreno com alturas do servidor, entidades com IDs estáveis, câmera, comandos de movimento/ação, construção e upgrade remoto, cartas, painel provisório de loja/Oficina, pesca e observador/co-op. A floresta usa instancing; materiais e modelos simples são reutilizados, inclusive nos upgrades.

Ainda **não** portado com fidelidade: modelos/skins/equipamento visual do browser, todas as silhuetas de evolução, praia/rio/vegetação detalhados, animações completas e áudio final, HUD/Forja premium, login e páginas de perfil/ranking/coleção, navegação assistida e preview preciso de colocação, automação configurável de upgrades do jogador. No protótipo, o martelo/peixe e os personagens são primitivas; pescar funciona no servidor, mas a apresentação é inicial. As contas e a coleção persistente existentes não são apagadas; o cliente nativo entra como convidado nesta etapa.

Os eventos autoritativos `attack-animation` alimentam a mesma linha do tempo de primeira e terceira pessoa. A forma visual é provisória, sem novas regras de combate. Movimento ainda é interpolado sem prediction/reconciliation local; testar a latência é necessário antes de declarar a responsividade final.

**144 FPS é meta, não resultado prometido.** Os testes `-nographics` validam execução/integração, não GPU ou FPS. O HUD mostra FPS e ping; use o Unity Profiler em um Development Build e compare frame time CPU/GPU (meta 6,94 ms), GC, batches, sombras e snapshots. Não usar FPS no Editor como benchmark final.

## 7. Contrato e testes

```powershell
npm run unity:contract
npm run unity:test
npm run release:check
```

`unity:contract` exporta dados diretamente de `shared/`: versões, balanceamento para exibição, itens, cartas, especializações e pesca. Não manter custos independentes no C#. Sempre reexporte após alterar esses dados e gere novo build. Um protocolo incompatível bloqueia a conexão.

`unity:test` compila os mesmos arquivos C# de transporte/store usados pela Unity. Compara os deltas com o gerador Node e testa sala/start/mapa/reconexão/saída nos quatro papéis contra servidor isolado, banco em memória e sem telemetria. Usa NuGet oficial com versão fixada. Não toca a partida aberta na porta 3000.

## 8. Gerar e testar Windows

No Editor: **Thornhold → Build Windows prototype**. Alternativa automatizada, ajustando o caminho do Editor se necessário:

```powershell
& 'C:\Program Files\Unity\Hub\Editor\6000.6.4f1\Editor\Unity.exe' -batchmode -nographics -projectPath "$PWD\unity\Thornhold" -executeMethod ThornholdProject.BuildWindows -quit -logFile "$PWD\artifacts\unity\build.log"
npm run unity:test:build
```

O segundo comando inicia o **executável compilado**, não um mock, contra um servidor isolado. Verifica modelos/mapa/deltas, movimento autoritativo, compra do Troll, co-op e saída. O teste acelera somente a sala temporária do Troll para atravessar a preparação. Para executar com GPU e salvar capturas:

```powershell
$env:THORNHOLD_CAPTURE='1'
npm run unity:test:build
Remove-Item Env:THORNHOLD_CAPTURE
```

Logs/capturas ficam em `artifacts/unity`. A captura usa a câmera real/URP num RenderTexture offscreen, após o envio da floresta instanciada, e rejeita imagens uniformes/vazias. Ela não inclui o HUD IMGUI e não é benchmark de FPS. Isso evita confundir o backbuffer preto de uma janela Windows oculta com erro no mapa. Os modos de smoke só são ativados explicitamente por argumentos; não concedem privilégios ao cliente. WSS é obrigatório para endereços remotos, e tokens de retomada ficam apenas em memória.

## Próximos cortes

1. Validação manual: movimento, colocação, reparo, pesca/venda, câmera durante ataque e partida co-op com browser + Unity.
2. Prediction/reconciliation e medições reais de CPU/GPU/GC em base desenvolvida.
3. Prefabs/rigs de Troll e Elfo, ferramentas e animações, evoluções dos prédios e cenário costeiro.
4. UI final, login/plataforma e coleção; depois IL2CPP/distribuição nativa.

O checkpoint do browser é `2fb6df3`. A migração está isolada na branch `codex/unity-client-v1`. Nenhuma tag de release, alteração do balanceamento ou deploy Azure é necessário para testar esta versão.
