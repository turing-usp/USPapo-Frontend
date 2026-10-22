# Arquitetura do frontend

Regra geral: `app/` só monta telas, `components/` só desenha e `lib/` guarda
dados e regras (é o que os testes cobrem). Nomes de interface e domínio
estão em português (`Botao`, `Conversa`); termos técnicos, em inglês.

## Navegação (`app/`)

- `_layout.tsx` carrega fontes, gestos (`GestureHandlerRootView`) e tema e faz a **porta de sessão**: sem
  sessão, qualquer rota fora de `(auth)` redireciona para `/login`.
- `(auth)`: login (email/senha ou Google), cadastro com checklist de senha
  e redefinição de senha pelo link do email.
- `(main)`: início (novo chat: marca, composer, três perguntas frequentes e
  a assinatura do Turing, numa tela que cabe sem rolar; o teclado não muda o
  layout, só acrescenta a própria altura embaixo para dar para rolar até o
  que ele cobre), `chat/[id]` e configurações. As conversas ficam na gaveta
  (`components/Conversas.tsx`; a marca do USPapo no topo dela também abre
  um novo chat), que carrega a lista ainda fechada e só a
  atualiza depois de terminar de abrir, para nada renderizar no meio do
  deslize. O deslize da gaveta usa o Reanimated e começa no próprio toque:
  o `Animated.timing` do React Native amostra a curva a 60 fps, e numa tela
  de 120 Hz metade dos quadros repetia a posição.
- **Gestos** (Android e iOS, `react-native-gesture-handler`): arrastar para
  a direita em qualquer ponto abre a gaveta acompanhando o dedo, e arrastar
  para a esquerda nela (ou no véu) a fecha; ao soltar, um movimento rápido
  decide, senão vale a posição, e ela termina na velocidade do dedo. Só
  arrastos quase horizontais contam, então listas rolam e tabelas largas
  continuam rolando de lado. No iOS, a borda esquerda fica para o "voltar"
  do sistema, e o "voltar" pela tela inteira do iOS 26 fica desligado
  (`fullScreenGestureEnabled`). Segurar uma conversa abre o menu dela;
  segurar uma pergunta ou resposta abre Copiar/Compartilhar. Todo gesto tem
  um botão equivalente (menu, X, ⋮, ícones sob as mensagens), e a web usa
  só os botões.
  O menu flutuante, a gaveta e os comunicados (pílula de aviso e vidro
  gigante) ficam em `components/Chrome.tsx`. Cada tela entra com um fade e
  uma subida curtos (`Tela`, em `components/Cena.tsx`); no app, a primeira
  entrada espera o primeiro layout da tela, senão a animação terminaria
  antes do primeiro quadro.
- `(admin)`: painel de métricas, **só na web**. A tela não decide quem é
  admin: o backend autoriza cada pedido pelo papel da conta.

## Uma pergunta, de ponta a ponta

1. `Composer` envia o texto (ou o ditado do microfone, via
   `expo-speech-recognition`) para `send` do hook `useChat` (`lib/chat.ts`).
2. A pergunta aparece na hora, e o turno é salvo **pendente** em
   `mensagens` (resposta `NULL`) antes do stream.
3. `streamChat` (`lib/api.ts`) faz `POST /api/chat` com `expo/fetch` (o
   `fetch` do React Native não tem corpo em streaming) e lê os frames SSE.
   O pedido leva `conversa_id` e `ordem`: o backend responde num job que
   **não depende da conexão**. Fechar o app ou a aba não interrompe nada;
   o servidor grava a resposta e manda a notificação. Na web de produção a
   URL é relativa (`/api`, reescrita pelo Vercel); no app e no dev server é
   `EXPO_PUBLIC_BACKEND_URL`.
4. Cada evento passa pelo redutor puro `reduzir`, que produz as `Linha`s
   da conversa: pergunta, ferramentas em uso, resposta, erro ou nota.
5. No `end`, o app também completa o turno no Supabase (quem gravar
   primeiro vence; o filtro `resposta IS NULL` impede sobrescrever) e a
   conversa vai para o cache local.

Abrir uma conversa com turno pendente primeiro **reata** a resposta em
andamento (`retomarChat`, `GET /api/chat/retomar`, que repete os eventos
desde o início). Sem job (backend reiniciado), relê o banco, porque a
resposta pode ter acabado de ser gravada, e só então reenvia a pergunta.
**Parar** chama `POST /api/chat/parar`: o servidor encerra o job e grava o
que já foi escrito, com a marca *Resposta interrompida.* Tocado antes de o
stream começar (enquanto o turno pendente é salvo), o stream nem começa e o
próprio app grava o turno com a marca. Sair da tela apenas desconecta, e a
resposta continua no servidor.

Erros viram mensagens em português (`traduzirFalha`): sessão expirada,
limite de uso (com o tempo de espera do 429), rede ou falha genérica.

A lista do chat é uma `ScrollView`, não uma `FlatList`: a conversa é curta
e o `scrollToEnd` precisa chegar ao fim real (a lista virtualizada estima
as linhas ainda não medidas e para antes). Cada turno (a pergunta e o que
vem depois dela) é um grupo, e o último tem pelo menos a altura do espaço
entre o menu e o composer: o fim da lista é a última pergunta no topo da
tela, com espaço livre embaixo. A pergunta enviada sobe até lá e a resposta
é escrita nesse espaço; enquanto cabe, nada se mexe, e uma resposta maior
continua por baixo do composer, sem a tela correr atrás dela (dá para ler
desde o começo). Com conteúdo abaixo da tela aparece uma seta de vidro que
leva ao fim. A tela segue o fim só ao abrir uma conversa e depois que o
usuário rola até ele (ou toca a seta); rolar para cima para de seguir. A
rolagem até o fim é feita agora e de novo no quadro seguinte, porque o
tamanho novo chega ao JS antes de o conteúdo nativo crescer.

## Notificações (`lib/notificacoes.ts` / `.web.ts`)

- **App:** push pelo Expo (`expo-notifications` + FCM). O token do aparelho
  vai para `dispositivos` pela função `registrar_dispositivo`; a permissão é
  pedida na primeira pergunta ou em Configurações. Com a conversa aberta na tela,
  o banner dela não aparece. Tocar na notificação abre a conversa. Ao sair
  da conta, o aparelho é esquecido.
- **Web:** sem push. Notificação local do navegador quando a resposta
  termina com a aba em segundo plano (aba fechada não recebe nada).

## Comunicados (`lib/comunicados.ts`, `components/Comunicados.tsx`)

Escritos fora do app, na tabela `comunicados` do Supabase (veja
`fluxos.md`). A **novidade** mais recente que o aparelho ainda não viu abre
sozinha num vidro gigante (título, imagens, texto em Markdown). O **aviso**
vira uma pílula entre o menu e a foto e abre o mesmo vidro; "Ocultar este
aviso" some com ele neste aparelho. O ponto laranja da pílula respira ao
aparecer e depois a cada 20 s, e a pílula incha e volta com a mola quando
ele reacende. O RLS só devolve o que está ativo e
dentro de `inicio`/`fim`, e os ids vistos ficam no aparelho. A lista é
relida ao abrir o app e ao voltar para ele depois de 5 minutos.

## Resposta na tela (`components/chat/`)

- `Resposta.tsx` revela o texto num ritmo constante (`useRevelacao`) em vez
  de despejar cada pedaço que chega. O markdown é dividido em blocos; cada
  bloco é memorizado e entra com um fade curto. Enquanto chega, `selar`
  fecha marcações abertas (`**`, crases) para não piscar símbolos crus.
- Links só abrem com `http(s)`/`mailto`; imagens do markdown são ignoradas.
- **Tabelas:** cada coluna recebe uma largura pelo conteúdo, como o layout
  automático de um navegador (`distribuirColunas` em `lib/markdown.ts`).
  Se couber, a tabela ocupa a largura toda; se não, as colunas de texto
  quebram linha até um piso confortável; e, se nem assim couber, a tabela
  rola na horizontal, com nenhuma coluna maior que 60% da caixa. Tem
  cabeçalho, listras e alinhamento por coluna. Uma tabela que cabe é uma
  `View` comum: um `ScrollView` desligado vira `touch-action: none` na web,
  e o dedo que começava na tabela não rolava a conversa.
- `<br>`, `<br/>` e `</br>` (comuns em células de tabela escritas pelo
  modelo) viram quebra de linha (`quebras`), exceto dentro de código.
- Os estilos de texto vêm do ancestral mais próximo (corpo, negrito,
  título, célula). `text` e `textgroup` ficam vazios de propósito: com o
  estilo do corpo neles, negrito e títulos saíam como texto comum.
- **LaTeX:** quando a resposta termina e tem fórmula (`\(`, `\[`, `$$`),
  `Matematica` a renderiza com KaTeX: HTML direto na web e um WebView
  com altura automática no app. Os arquivos do KaTeX são copiados para
  `public/katex/` no `postinstall` (a CSP do site não permite CDN).
- **Widgets na resposta** (`lib/widgets.ts`): um bloco de código com a
  linguagem `uspapo-<tipo>` não é impresso, é desenhado. Ele vem no próprio
  texto da resposta (o contrato do stream não mudou) e fica salvo com ela,
  então a conversa reaberta desenha de novo. O corpo é só uma referência
  curta (`chave=valor`); o widget busca o que precisa. Enquanto o bloco
  ainda chega, o widget mostra a caixa vazia na altura final; um `tipo`
  desconhecido (widget de uma versão mais nova) não aparece. Copiar e
  Compartilhar tiram os blocos, e numa resposta com fórmula o KaTeX recebe
  só a prosa e o widget fica nativo embaixo.
- **Mapa** (`Mapa.tsx`, `lib/mapa.ts`, tipo `mapa`): o trajeto de ônibus
  de uma resposta de transporte. O app pede `GET /api/mapa` com a
  referência (linha e paradas) e recebe só geometria: o trecho percorrido
  (polyline codificada), as duas paradas e os dois lugares; guarda o
  resultado por referência enquanto o app está aberto. A base do campus
  (contorno, prédios, ruas, avenidas, água, trilhos) vem com o app em
  `assets/mapa/campus.json` (70 KB, gerada do OpenStreetMap por
  `scripts/mapa-campus.mjs`): não há servidor de tiles nem chave. Tudo é um
  SVG estático (`react-native-svg`): cores da paleta variando só a
  opacidade, o trajeto em `accent` (azul no claro, laranja no escuro) com um
  halo da cor do fundo, caminhadas pontilhadas em linha reta (são
  estimativas), legenda e crédito "© OpenStreetMap" em Roboto Mono.
- **Grade horária** (`Grade.tsx`, `lib/grade.ts`, tipo `grade`): a semana das
  turmas escolhidas. O app pede `GET /api/grade` com a referência
  (`turmas=SIGLA:código,...`) e recebe horários, nomes e professores.
  `montarQuadro` (testado em `tests/grade.test.ts`) põe os dias úteis em
  colunas (sábado só se usado), o tempo em proporção (0,7 px/min), dobra em
  uma faixa fina os vãos de 90 min ou mais, escreve no eixo os horários
  exatos de início e fim (sem sobrepor rótulos), junta numa caixa duas turmas
  da mesma disciplina no mesmo horário ("T2 e T3", como o JupiterWeb) e
  divide a coluna quando há choque. Cada disciplina tem uma cor da paleta com
  opacidade (bordas no tom cheio; texto na cor do texto, ≥ 7:1 na sigla e
  ≥ 4,5:1 na turma em todos os temas, conferido por script); choque leva
  contorno tracejado e uma linha com o alerta (sem vermelho). A legenda dá
  nome e professores; o dia de hoje fica no `accent`.
- **Próximos ônibus** (`Onibus.tsx`, `lib/onibus.ts`, tipo `onibus`): as
  próximas passagens numa parada, contando os minutos. O app pede
  `GET /api/onibus` com as linhas e as paradas do GTFS e recebe, por linha e
  sentido, o instante de cada passagem (ao vivo pelo Olho Vivo, ou pela
  programação, dito na tela: o ao vivo tem um ponto pulsando no `accent`, o
  previsto não). Sem cache: conta os minutos a cada 15 s e pede de novo a
  cada 30 s com o app na frente, por 15 min (Atualizar renova).
- **Grade curricular** (`Curriculo.tsx`, `lib/curriculo.ts`, tipo
  `curriculo`): as obrigatórias de um curso por semestre ideal, em cartões
  (sigla; com espaço, o nome). `GET /api/curriculo` traz a grade e
  `GET /api/curriculo/requisitos`, logo depois, os requisitos que o
  JupiterWeb lista para aquele curso. Tocar num cartão acende o que ele pede
  (borda cheia) e o que libera (tracejada), apaga o resto e desenha as
  setas (`curva`, testada em `tests/widgets-novos.test.ts`).
- **Onde é a aula** (`Sala.tsx`, `lib/sala.ts`, tipo `sala`): as aulas de
  uma disciplina (USPolis) com sala e prédio, e os prédios da turma
  escolhida sobre a mesma base do campus do mapa (`BaseDoCampus`).
- **Avaliação de alunos** (`Avaliacao.tsx`, `lib/avaliacao.ts`, tipo
  `avaliacao`): as médias de um professor no USP Avalia por disciplina e os
  cinco quesitos da escolhida; Dificuldade na cor do texto (alta é matéria
  puxada, não defeito), aviso de que é opinião de alunos e link para o site.
- **Moldura dos widgets** (`Moldura.tsx`): a caixa comum de todos os widgets:
  título em Changa e detalhe em Roboto Mono, com Ampliar, Baixar e
  Compartilhar ao lado (e um botão do próprio widget, como o Atualizar dos
  ônibus), fora da imagem. O rodapé (`RodapeDoWidget`) é uma linha só: a
  fonte dos dados à esquerda e a marca do USPapo (logo e nome) à direita, no
  chat, em tela cheia e na imagem salva.
  `useDadosDoWidget` busca os dados da referência quando o bloco termina de
  chegar. Ampliar abre `Visualizador.tsx`: tela cheia, o widget desenhado
  de novo na folha (não uma imagem esticada), com os controles em pílulas
  de vidro por cima. O zoom é simples de propósito: uma regra só, aplicada a
  cada movimento e nunca corrigida depois (a folha não sai da área entre as
  barras), e cada evento move a folha pela mudança desde o anterior, a
  partir de onde ela está. Pinça com zoom em volta dos dedos (um dedo que
  pousa ou levanta no meio da pinça muda o centro dos dedos, e esse evento
  só registra o novo centro: no Android a pinça só termina quando o último
  dedo sai), arrastar com inércia, toque duplo, e na web
  a roda (Ctrl ou a pinça do trackpad dá zoom no cursor) e as teclas + − 0;
  os mesmos zooms em botões (−, 100 %, +), em degraus fixos (100, 125, 150,
  200, 300, 400 %, e "ver tudo" abaixo de 100 % numa folha mais alta que a
  tela) que o − desce iguais; voltar a 100 % restaura a vista da abertura. A
  medida, o encaixe e os botões rodam no UI thread (`runOnUI`): lido do JS
  no Android, um valor recém-escrito ainda vinha zerado e a folha não
  aparecia. A conta do zoom fica em `lib/zoom.ts` (testada). `lib/imagem.ts` captura a caixa como PNG
  (`react-native-view-shot`), salva na galeria (`expo-media-library`: no iOS
  pede só para adicionar fotos; no Android 10+ não pede nada; no 9 ou
  anterior cai na folha de compartilhar), com o nome do arquivo limpo
  (`expo-file-system`; o view-shot põe dígitos aleatórios) ou compartilha (`expo-sharing`);
  `lib/imagem.web.ts` baixa o PNG (html2canvas) e compartilha onde o
  navegador compartilha arquivos.
- `Feedback.tsx`: útil / não útil, com motivo e comentário opcionais,
  gravados em `mensagem_feedbacks`.
- `AcoesDaMensagem.tsx`: Copiar (`expo-clipboard`; o ícone vira um check por
  um instante) e Compartilhar (a folha do sistema; na web só onde o
  navegador tem `navigator.share`) sob cada pergunta e resposta, e os
  mesmos dois num menu ao segurar a mensagem (`components/MenuAncorado.tsx`,
  o mesmo menu das conversas). No app as mensagens não são selecionáveis,
  para a seleção de texto não disputar o toque longo; na web continuam.

## Vidro fosco (`components/Glass.tsx`)

Os controles flutuantes pequenos (botão de menu, pílula de aviso, menu da
conta e o composer do chat) usam todos o mesmo vidro com blur (tinta
`vidro`, um pouco mais densa que a dos cartões, para o texto passar no AA do
WCAG no ponto mais movimentado de cada tema). Os painéis grandes (gaveta,
vidro gigante, menu de ações da conversa) são `opaco`: a mesma tinta e as
mesmas bordas sobre a cor de fundo, sem blur. O composer tem só a borda
laranja a mais. As tintas são cores da paleta com opacidade (branco no
claro, o cinza `#494c56` no escuro e no OLED), e o blur é puro, sem
saturação, igual nas plataformas: saturar o que está atrás tiraria as cores
da paleta. Uma cor de borda passada em `borda` (a laranja do composer, o
anel de foco dos campos) vai para os quatro lados, porque a cor por lado do
filete venceria um `borderColor`.

- **Web:** `backdrop-filter: blur()` no próprio painel. Um
  ancestral com `opacity < 1` isola o painel do que está atrás; o Chrome
  mantém o painel sem blur mesmo depois que o fade termina. Por isso a
  entrada e a saída de um vidro com blur vão no próprio vidro (`movimento`),
  nunca num embrulho.
- **iOS:** `BlurView` nativo.
- **Android 12+:** `BlurView` com `RenderEffect` (acelerado por hardware).
  Em versões anteriores, o painel fica só translúcido.
  Um `BlurView` não consegue borrar o que está dentro dele mesmo; por isso
  `CamadaDeVidro` separa o `fundo` (conteúdo que rola, dentro de um
  `BlurTargetView`) da `frente` (menu, composer), que fica por cima como
  irmã e borra o alvo. O chat (composer) tem a sua própria camada.
- Superfícies dentro do conteúdo (balões, cartões) usam só uma tinta
  translúcida, que é barata.

Detalhes do Android, sem alterar o `expo-blur`:

- O raio é o mesmo do web. O CSS usa `blur(σ)`; o `RenderEffect` usa um raio
  com σ = 0,57735·raio + 0,5, em pixels do aparelho, e a BlurView da Dimezis
  ainda multiplica esse raio por 4. `Desfoque` compensa as duas coisas.
- O desfoque replica os pixels da borda do alvo (`CLAMP`). Se o alvo
  terminasse na borda da tela, o texto que passa por ali pulsaria na
  status bar e no composer ao rolar. Por isso o alvo transborda a tela em
  56dp (pouco mais de 3σ do blur), preenchidos pela própria cor de fundo
  (`Backdrop`).
- **Cada vidro com blur renderiza o alvo inteiro (a tela mais a sobra)
  numa camada fora da tela e refaz o blur a cada quadro, seja qual for o
  tamanho do vidro** (medido: camadas de 1530×2790 px no Galaxy S22). O custo
  cresce com o número de vidros na tela, não com a área deles; a sobra do
  alvo é a mínima que evita o artefato da borda. Por isso a faixa da status
  bar é um degradê do fundo (no iOS também: lá ela era um vidro de borda dura,
  que aparecia como uma faixa sobre o fundo vazio), e nada fica animando em loop com a tela
  parada: o ponto da pílula respira uma vez ao aparecer e depois a cada 20 s
  (em loop contínuo, mantinha a tela redesenhando a ~60 fps). Escalar um bloco grande de texto também custa
  caro (os glifos são rasterizados de novo a cada quadro): enquanto o vidro
  gigante cresce, ele é desenhado de uma textura de GPU
  (`renderToHardwareTextureAndroid`, com folga para a sombra), e só a
  textura escala. Um `filter` (saturação, contraste)
  sobre o blur criava uma camada re-rasterizada a cada quadro e derrubava a
  rolagem para ~12 fps: não use.
- A BlurView aplica um ruído leve por cima (não configurável sem mexer na
  biblioteca).
- **Tela congelada:** enquanto um painel grande está em cena (a gaveta ou o
  vidro gigante, via `useCongelarTela`), a tela por baixo fica parada sob o
  véu e vira uma textura de GPU (`renderToHardwareTextureAndroid`), e a
  gaveta também enquanto desliza. Sem isso o Android redesenhava cada ícone,
  texto e sombra da tela a cada quadro, e cada blur re-renderizava tudo isso
  (medido no S22: GPU de ~10,6 para ~5 ms por quadro, com os blurs ligados).
  Desligar o blur durante a gaveta também baixava o custo, mas fazia os
  vidros piscarem ao trocar de aparência: não faça.

**Sombras:** no Android, a elevação pinta uma caixa escura sob o vidro
translúcido. Por isso o tema converte a sombra em `boxShadow` (a mesma do
web, recortada fora do painel).

## Movimento (`components/Movimento.tsx`)

As animações "bubbly" rodam no Reanimated (na thread de UI, a cada quadro,
desde o próprio toque) com uma mola rápida que passa um pouco do tamanho
final e volta (`MOLA`, ~0,35 s):

- **Surgir:** menus (ações da conversa, Copiar/Compartilhar, conta), a seta
  "ir para o fim", a pílula de aviso e o vidro gigante crescem a partir de
  onde nasceram (o ⋮, o dedo, o avatar), o vidro primeiro e o conteúdo um
  instante depois, e saem mais rápido. A pergunta enviada sobe do composer;
  as fontes consultadas, o formulário de feedback, o "Conversa apagada", as
  perguntas frequentes e o botão de enviar/parar surgem com a mesma mola, e
  o check de Copiar e o polegar escolhido saltam. O interruptor desliza com
  mola. `useSurgimento` controla mostrar/esconder; `Surgir` anima uma vez,
  ao montar. A animação começa um quadro depois de montar (os primeiros
  quadros de uma montagem são longos e engoliriam o começo).
- **Pressionar:** todo vidro tocável, o botão laranja, o disco de enviar e o
  avatar cedem sob o dedo e voltam com a mola (`Pressionavel`); o laranja
  também perde um pouco de opacidade, porque a paleta não tem laranja mais
  claro.
- Nada fica em loop com a tela parada (cada quadro redesenha os blurs no
  Android), e com "reduzir movimento" ligado no sistema o Reanimated pula
  direto para o fim de cada animação.

## Dados (`lib/`)

| Arquivo | Papel |
|---|---|
| `supabase.ts` | cliente Supabase (PKCE; sessão no AsyncStorage) |
| `auth.ts` | mensagens de erro de login, regras de senha, Google OAuth (web: redirect; app: navegador + deep link `uspapofe://`; o botão só aparece se o projeto tem o Google ligado, lido de `/auth/v1/settings`), troca de senha em Ajustes (confere a senha atual entrando de novo; conta só Google cria a primeira) |
| `conversations.ts` | `conversas`/`mensagens`: histórico, abrir, anexar turno (idempotente), renomear, favoritar (máx. 5, regra no banco), excluir |
| `cache.ts` | cache **só de leitura** das conversas, por usuário; sem rede, o histórico abre mas não dá para perguntar |
| `feedback.ts` | avaliações das respostas |
| `exclusoes.ts` | exclusões com "desfazer": pendentes no módulo (não na tela), efetivadas ao fechar a gaveta ou mandar o app para segundo plano |
| `device.ts` | háptica (desligável; no Android, os efeitos curtos do sistema, que seguem a intensidade de toque do aparelho, em vez dos pulsos de 40-60 ms do `expo-haptics`), altura do teclado (no Android o RN já desconta as barras do sistema), ditado |
| `markdown.ts` | blocos e selagem do streaming, `<br>`, larguras das colunas das tabelas, HTML e CSS do KaTeX |
| `widgets.ts` | leitura dos blocos ```` ```uspapo-<tipo> ````, remoção deles do texto copiado e o GET de cada widget (em cache por referência) |
| `mapa.ts` | geometria do mapa (`GET /api/mapa`, uma vez por referência), polyline, projeção e enquadramento sobre a base embutida |
| `grade.ts` | horários da grade (`GET /api/grade`) e o layout da semana (`montarQuadro`), rótulos T3, descrição para leitor de tela |
| `imagem.ts` / `.web.ts` | widget como PNG: galeria e folha de compartilhar (app), download e `navigator.share` (web) |
| `notificacoes.ts` / `.web.ts` | push (app) ou notificação local (web) quando a resposta termina |
| `comunicados.ts` | leitura dos comunicados em vigor, escolha do que mostrar, ids vistos no aparelho |
| `admin.ts` | tipos e formatação do resumo do painel |

## Identidade visual e tema (`theme/`)

O app segue o manual de identidade visual do Turing USP (2021).

- **Cores:** só as da paleta do manual (`theme/paleta.ts`: laranja
  `#f1863d`, azul `#0660a2` e as de apoio), e a única variação é baixar a
  opacidade (`alfa`). Fora da paleta, só o preto puro: o fundo do OLED e as
  sombras dos temas escuros. Não há vermelho nem verde: erros têm o ícone
  de alerta laranja ao lado do texto (`Erro`), "Parar" é um disco na cor do
  texto e os checks da senha usam o destaque.
- **Papéis por tema** (`theme/index.tsx`): fundo `#ededf5` com texto
  grafite `#272830` (claro), grafite com texto branco (escuro), preto com
  texto branco (OLED). O laranja é o preenchimento da marca (botões, a
  marca do USPapo, bordas), e sobre ele texto e ícones são grafite (5,7:1;
  branco daria 2,6:1). Texto e gráficos que precisam de cor usam o
  `accent`: azul no claro e laranja nos escuros (laranja sobre o fundo
  claro daria 2,2:1). Texto secundário é a cor do texto a 72%, que passa no
  AA até sobre o vidro com conteúdo atrás.
- **Fundo:** liso, só a cor do tema (`Backdrop`), como os fundos dos
  padrões do manual; o ícone do app é a marca laranja sobre o azul
  escuro `#2b4e72` liso (3,4:1).
- **Fontes** (`assets/fonts/LEIAME.md`): Changa Medium em títulos, botões e
  navegação; M PLUS 1p em texto; Roboto Mono em código e detalhes
  (endereços, versão, "pendente"). Changa nunca em texto corrido, M PLUS 1p
  e Roboto Mono nunca em títulos. A Orbitron é só do logotipo do Turing,
  desenhado em SVG. O iOS usa uma cópia da Changa com métricas verticais
  latinas: com as originais (altas, do árabe), o iOS subia ~0,3 em todo
  texto em Changa.
- **Marcas:** `Marca` (o símbolo laranja do USPapo e o nome em Changa, no
  `accent`) abre a tela inicial, a gaveta e as telas de entrada;
  `Assinatura` ("Desenvolvido por" e o imagotipo do Turing: nas cores do
  manual no claro, na forma branca nos escuros) fecha a tela inicial, as
  telas de entrada e Configurações.

- **Mouse (web):** tudo que é tocável reage ao passar o mouse, como ao
  toque, só que mais leve (`components/ui.tsx`): linhas e ícones ganham um
  tom da cor do texto (`tintaDoToque`: 6% sob o mouse, 10% pressionado;
  `BotaoDeIcone` para os ícones), o vidro tocável ganha o mesmo tom por
  cima, o laranja só perde opacidade (`Pressionavel` com `desbotar`; a
  paleta não tem laranja mais claro) e os links se sublinham. Uma conversa da gaveta fica
  acesa inteira enquanto o mouse está nela ou no seu ⋮. No app, onde não há
  mouse, os mesmos tons aparecem só ao pressionar.

No site com mouse, as barras de rolagem usam trilho transparente e puxador
fino, com a cor do texto do tema a 32% (50% ao passar o mouse ou focar o
conteúdo). O CSS global em `app/_layout.tsx` atende também a lista de
conversas, com fallback WebKit; `theme/index.tsx` atualiza as variáveis e o
`color-scheme` ao trocar o tema. Dispositivos de toque e o modo de cores
forçadas mantêm os indicadores do sistema.

A escolha do tema (sistema, claro, escuro, OLED) fica salva no aparelho;
`escuro` vale para o escuro e para o OLED.

## Web

`vercel.json` define o build (`npm run export:web`), o proxy `/api/*` para o
backend, o fallback de SPA e os cabeçalhos de segurança (CSP com
`connect-src 'self'` + Supabase, HSTS, `Permissions-Policy` liberando só o
microfone). `scripts/web-head.mjs` injeta favicon, ícones e manifest no
`index.html` exportado.

## Atualizações (`expo-updates`)

O binário pergunta ao EAS Update, a cada abertura, se há uma versão nova do
JavaScript no seu **canal** (`preview` ou `production`, definido no build por
`EXPO_UPDATES_CHANNEL` via `app.config.js`). A atualização baixa em segundo
plano e entra na abertura seguinte. O *runtime version* é o fingerprint da
parte nativa: um update só chega a binários com o mesmo fingerprint.
