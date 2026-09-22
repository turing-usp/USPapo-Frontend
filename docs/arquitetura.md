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
  O menu flutuante e a gaveta ficam em `components/Chrome.tsx`.
- `(admin)`: painel de métricas, **só na web**. A tela não decide quem é
  admin: o backend autoriza cada pedido pelo papel da conta.

## Uma pergunta, de ponta a ponta

1. `Composer` envia o texto (ou o ditado do microfone, via
   `expo-speech-recognition`) para `send` do hook `useChat` (`lib/chat.ts`).
2. O turno é salvo **pendente** em `mensagens` (resposta `NULL`) antes do
   stream. Se o stream morrer, ele continua pendente e é reenviado na
   próxima abertura da conversa.
3. `streamChat` (`lib/api.ts`) faz `POST /api/chat` com `expo/fetch` (o
   `fetch` do React Native não tem corpo em streaming) e lê os frames SSE.
   Na web de produção a URL é relativa (`/api`, reescrita pelo Vercel); no
   app e no dev server é `EXPO_PUBLIC_BACKEND_URL`.
4. Cada evento passa pelo redutor puro `reduzir`, que produz as `Linha`s
   da conversa: pergunta, ferramentas em uso, resposta, erro ou nota.
5. No `end`, o turno é completado no Supabase e a conversa vai para o cache
   local.

Erros viram mensagens em português (`traduzirFalha`): sessão expirada,
limite de uso (com o tempo de espera do 429), rede ou falha genérica.

## Resposta na tela (`components/chat/`)

- `Resposta.tsx` revela o texto num ritmo constante (`useRevelacao`) em vez
  de despejar cada pedaço que chega. O markdown é dividido em blocos; cada
  bloco é memorizado e entra com um fade curto. Enquanto chega, `selar`
  fecha marcações abertas (`**`, crases) para não piscar símbolos crus.
- Links só abrem com `http(s)`/`mailto`; imagens do markdown são ignoradas.
- **LaTeX:** quando a resposta termina e tem fórmula (`\(`, `\[`, `$$`),
  `Matematica` a renderiza com KaTeX: HTML direto na web e um WebView
  com altura automática no app. Os arquivos do KaTeX são copiados para
  `public/katex/` no `postinstall` (a CSP do site não permite CDN).
- `Feedback.tsx`: útil / não útil, com motivo e comentário opcionais,
  gravados em `mensagem_feedbacks`.

## Vidro fosco (`components/Glass.tsx`)

- **Web:** `backdrop-filter: blur() saturate()`.
- **iOS:** `BlurView` nativo.
- **Android 12+:** `BlurView` com `RenderEffect` (acelerado por hardware).
  Em versões anteriores, o painel fica só translúcido.
  Um `BlurView` não consegue borrar o que está dentro dele mesmo; por isso
  `CamadaDeVidro` separa o `fundo` (conteúdo que rola, dentro de um
  `BlurTargetView`) da `frente` (menu, composer), que fica por cima como
  irmã e borra o alvo.
- Superfícies dentro do conteúdo (balões, cartões) usam só uma tinta
  translúcida, que é barata.

## Dados (`lib/`)

| Arquivo | Papel |
|---|---|
| `supabase.ts` | cliente Supabase (PKCE; sessão no AsyncStorage) |
| `auth.ts` | mensagens de erro de login, regras de senha, Google OAuth (web: redirect; app: navegador + deep link `uspapofe://`) |
| `conversations.ts` | `conversas`/`mensagens`: histórico, abrir, anexar turno (idempotente), renomear, favoritar (máx. 5, regra no banco), excluir |
| `cache.ts` | cache **só de leitura** das conversas, por usuário; sem rede, o histórico abre mas não dá para perguntar |
| `feedback.ts` | avaliações das respostas |
| `device.ts` | háptica (desligável), altura do teclado, ditado |
| `markdown.ts` | detecção de fórmulas, HTML do KaTeX, fechamento de marcações |
| `admin.ts` | tipos e formatação do resumo do painel |

## Tema (`theme/index.tsx`)

Cores (claro/escuro), espaçamento, raios, tipografia e tokens do vidro. O
laranja da marca é o mesmo nos dois modos. A escolha (sistema, claro,
escuro) fica salva no aparelho.

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
