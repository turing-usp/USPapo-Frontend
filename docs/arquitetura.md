# Arquitetura do frontend

Regra geral: `app/` só monta telas, `components/` só desenha e `lib/` guarda
dados e regras (é o que os testes cobrem). Nomes de interface e domínio
estão em português (`Botao`, `Conversa`); termos técnicos, em inglês.

## Navegação (`app/`)

- `_layout.tsx` carrega fontes e tema e faz a **porta de sessão**: sem
  sessão, qualquer rota fora de `(auth)` redireciona para `/login`.
- `(auth)`: login (email/senha ou Google), cadastro com checklist de senha
  e redefinição de senha pelo link do email.
- `(main)`: início (sugestões + composer), `chat/[id]`, histórico e ajustes.
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
2. O turno é salvo **pendente** em `mensagens` (resposta `NULL`) antes do
   stream.
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
que já foi escrito, com a marca *Resposta interrompida.* Sair da tela apenas
desconecta, e a resposta continua no servidor.

Erros viram mensagens em português (`traduzirFalha`): sessão expirada,
limite de uso (com o tempo de espera do 429), rede ou falha genérica.

A lista do chat é uma `ScrollView`, não uma `FlatList`: a conversa é curta
e o `scrollToEnd` precisa chegar ao fim real (a lista virtualizada estima
as linhas ainda não medidas e para antes). A tela segue o fim até o usuário
rolar para cima, e volta a seguir quando ele retorna perto do fim. A
rolagem é feita agora e de novo no quadro seguinte, porque o tamanho novo
chega ao JS antes de o conteúdo nativo crescer.

## Notificações (`lib/notificacoes.ts` / `.web.ts`)

- **App:** push pelo Expo (`expo-notifications` + FCM). O token do aparelho
  vai para `dispositivos` pela função `registrar_dispositivo`; a permissão é
  pedida na primeira pergunta ou em Ajustes. Com a conversa aberta na tela,
  o banner dela não aparece. Tocar na notificação abre a conversa. Ao sair
  da conta, o aparelho é esquecido.
- **Web:** sem push. Notificação local do navegador quando a resposta
  termina com a aba em segundo plano (aba fechada não recebe nada).

## Comunicados (`lib/comunicados.ts`, `components/Comunicados.tsx`)

Escritos fora do app, na tabela `comunicados` do Supabase (veja
`fluxos.md`). A **novidade** mais recente que o aparelho ainda não viu abre
sozinha num vidro gigante (título, imagens, texto em Markdown). O **aviso**
vira uma pílula entre o menu e a foto e abre o mesmo vidro; "Ocultar este
aviso" some com ele neste aparelho. O RLS só devolve o que está ativo e
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
- `Feedback.tsx`: útil / não útil, com motivo e comentário opcionais,
  gravados em `mensagem_feedbacks`.

## Vidro fosco (`components/Glass.tsx`)

Todo painel flutuante com blur usa o mesmo vidro do botão de menu (tinta
`vidro`, um pouco mais densa que a dos cartões, para o texto passar no AA do
WCAG no ponto mais movimentado de cada tema): gaveta, menu da conta, pílula
de aviso, vidro gigante, menu de ações do histórico, "Desfazer" e o composer
do chat. O composer tem só a borda laranja a mais.

- **Web:** `backdrop-filter: blur() saturate()` no próprio painel. Um
  ancestral com `opacity < 1` isola o painel do que está atrás; o Chrome
  mantém o painel sem blur mesmo depois que o fade termina. Por isso o fade
  de entrada/saída vai no próprio vidro (`opacidade`), nunca num embrulho.
- **iOS:** `BlurView` nativo.
- **Android 12+:** `BlurView` com `RenderEffect` (acelerado por hardware).
  Em versões anteriores, o painel fica só translúcido.
  Um `BlurView` não consegue borrar o que está dentro dele mesmo; por isso
  `CamadaDeVidro` separa o `fundo` (conteúdo que rola, dentro de um
  `BlurTargetView`) da `frente` (menu, composer), que fica por cima como
  irmã e borra o alvo. O chat (composer) e o histórico (menu de ações e
  "Desfazer") têm a sua própria camada; o menu de ações não é um `Modal`,
  que abriria outra janela, fora do alcance do blur.
- Superfícies dentro do conteúdo (balões, cartões) usam só uma tinta
  translúcida, que é barata.

Detalhes do Android, sem alterar o `expo-blur`:

- O raio é o mesmo do web. O CSS usa `blur(σ)`; o `RenderEffect` usa um raio
  com σ = 0,57735·raio + 0,5, em pixels do aparelho, e a BlurView da Dimezis
  ainda multiplica esse raio por 4. `Desfoque` compensa as duas coisas.
- O desfoque replica os pixels da borda do alvo (`CLAMP`). Se o alvo
  terminasse na borda da tela, o texto que passa por ali pulsaria na
  status bar e no composer ao rolar. Por isso o alvo transborda a tela em
  56dp (pouco mais de 3σ do blur), preenchidos pelo próprio fundo
  (`Backdrop` com `margem`).
- **Cada vidro com blur renderiza o alvo inteiro (a tela mais a sobra)
  numa camada fora da tela e refaz o blur a cada quadro, seja qual for o
  tamanho do vidro** (medido: camadas de 1530×2790 px no Galaxy S22). O custo
  cresce com o número de vidros na tela, não com a área deles; a sobra do
  alvo é a mínima que evita o artefato da borda. Por isso, no Android, a faixa da
  status bar é um degradê do fundo, e nada fica animando em loop com a tela
  parada: o ponto da pílula respira uma vez ao aparecer e depois a cada 20 s
  (em loop contínuo, mantinha a tela redesenhando a ~60 fps). Escalar um bloco grande de texto também custa
  caro (os glifos são rasterizados de novo a cada quadro): o vidro gigante
  entra com fade e subida, sem zoom. Um `filter` (saturação, contraste)
  sobre o blur criava uma camada re-rasterizada a cada quadro e derrubava a
  rolagem para ~12 fps: não use.
- O Android não tem o `saturate(150%)` do web, e a BlurView aplica um ruído
  leve por cima (não configurável sem mexer na biblioteca).

**Sombras:** no Android, a elevação pinta uma caixa escura sob o vidro
translúcido. Por isso o tema converte a sombra em `boxShadow` (a mesma do
web, recortada fora do painel).

## Dados (`lib/`)

| Arquivo | Papel |
|---|---|
| `supabase.ts` | cliente Supabase (PKCE; sessão no AsyncStorage) |
| `auth.ts` | mensagens de erro de login, regras de senha, Google OAuth (web: redirect; app: navegador + deep link `uspapofe://`) |
| `conversations.ts` | `conversas`/`mensagens`: histórico, abrir, anexar turno (idempotente), renomear, favoritar (máx. 5, regra no banco), excluir |
| `cache.ts` | cache **só de leitura** das conversas, por usuário; sem rede, o histórico abre mas não dá para perguntar |
| `feedback.ts` | avaliações das respostas |
| `exclusoes.ts` | exclusões com "desfazer": pendentes no módulo (não na tela), efetivadas ao sair do histórico ou mandar o app para segundo plano |
| `device.ts` | háptica (desligável), altura do teclado (no Android o RN já desconta as barras do sistema), ditado |
| `markdown.ts` | blocos e selagem do streaming, `<br>`, larguras das colunas das tabelas, HTML do KaTeX |
| `notificacoes.ts` / `.web.ts` | push (app) ou notificação local (web) quando a resposta termina |
| `comunicados.ts` | leitura dos comunicados em vigor, escolha do que mostrar, ids vistos no aparelho |
| `admin.ts` | tipos e formatação do resumo do painel |

## Tema (`theme/index.tsx`)

Cores (claro, escuro e escuro OLED), espaçamento, raios, tipografia e
tokens do vidro. O laranja da marca é o mesmo em todos. A escolha (sistema,
claro, escuro, OLED) fica salva no aparelho; `escuro` vale para o escuro e
para o OLED.

Os brilhos do fundo mantêm o mesmo contraste (WCAG) contra a base em todos
os temas: ~1,16 e ~1,12, como os laranjas do claro. O escuro usa azul, e o
OLED usa, sobre preto puro, uma brasa laranja e um índigo fraco, com vidro
grafite e filete superior âmbar.

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
