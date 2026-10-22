# Fluxos comuns do frontend

## Ambientes

| Arquivo | Usado por | Aponta para |
|---|---|---|
| `.env` (não versionado) | `npm run web`, `npm run android` (dev) | o que você quiser; normalmente Supabase local + `http://127.0.0.1:8000` |
| `.env.production` (versionado) | APK, EAS Build, EAS Update, Vercel | Supabase de produção + backend no Render |

Tudo que começa com `EXPO_PUBLIC_` vai para dentro do app e é público por
definição (a chave anônima do Supabase depende de RLS, não de sigilo).
Nunca coloque segredos aqui.

No navegador, `/api/*` usa a origem do frontend em todos os ambientes. Em
desenvolvimento, o Metro encaminha as chamadas para `EXPO_PUBLIC_BACKEND_URL`
(`scripts/dev-proxy.cjs`); em produção, o Vercel faz esse encaminhamento.
Assim é possível rodar só o frontend local com os serviços online existentes,
sem adicionar localhost ao CORS de produção. O proxy preserva o token de cada
sessão e o streaming do chat. Reinicie `npm run web` depois de alterar a URL
do backend ou a configuração do Metro. No Android/iOS, a URL é usada diretamente.

## Testar no Android com o backend local

```bash
npm run android                      # build debug + Metro; precisa de emulador ou aparelho via USB
adb reverse tcp:54321 tcp:54321      # Supabase local
adb reverse tcp:8000 tcp:8000        # backend local
```

Com os `adb reverse`, o `127.0.0.1` do `.env` funciona dentro do emulador.
Builds debug aceitam HTTP; builds release não.

Para medir desempenho de verdade (blur, rolagem), use um build **release**
apontando para o ambiente local: exporte `EXPO_PUBLIC_BACKEND_URL`,
`EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY` no shell (eles
vencem os arquivos `.env`), acrescente `android:usesCleartextTraffic="true"`
ao `<application>` de `android/app/src/main/AndroidManifest.xml` e rode o
Gradle. Nunca distribua esse APK: gere o final com `npm run apk:preview`,
que recria `android/` do zero.

```bash
adb shell dumpsys gfxinfo org.turingusp.uspapo reset   # zera as estatísticas
# ... role a tela, abra a gaveta ...
adb shell dumpsys gfxinfo org.turingusp.uspapo | grep -E "Janky|50th|90th"
```

Não envie teclas pelo adb (`input keyevent`, `input text`) durante testes
visuais: elas tiram o Android do modo toque, e ele passa a desenhar o
realce de foco e a rolar a tela até o elemento focado.

## Gerar um APK

```bash
npm run apk:preview
# -> android/app/build/outputs/apk/release/app-release.apk (arm64, canal preview)
```

O script regenera `android/` do zero (`prebuild --clean`) com o canal
`preview`. Para um emulador x86_64, rode o Gradle de novo com
`-PreactNativeArchitectures=arm64-v8a,x86_64`. O APK é assinado com a chave
de debug: serve para testes internos, não para a Play Store.

> **Não recompile em cima de um `android/` antigo depois de mudar
> configuração.** O Gradle reaproveita o fingerprint calculado no build
> anterior, e o APK passa a recusar os updates novos. Use sempre
> `npm run apk:preview` ou apague
> `android/app/build/generated/assets/createReleaseUpdatesResources/`.

## Testar no iPhone (Mac com Xcode, sem conta paga)

Sem o Apple Developer Program, o EAS não assina builds para aparelho; o Mac
assina com um Apple ID gratuito ("Personal Team"). Esse tipo de assinatura
não permite push, então o build sai sem ele (`IOS_SEM_PUSH=1`), vale 7 dias
e só instala nos aparelhos ligados a esse Mac.

```bash
npm ci
export EXPO_UPDATES_CHANNEL=preview IOS_SEM_PUSH=1
npx expo prebuild -p ios --clean
npx expo run:ios --device --configuration Release   # backend de produção (.env.production)
```

Na primeira vez, abra `ios/USPapo.xcworkspace` no Xcode, escolha o seu
Apple ID em *Signing & Capabilities → Team* e, se o Xcode recusar o
bundle id, troque-o só ali (ex.: `org.turingusp.uspapo.<nome>`). No iPhone:
ative *Ajustes → Privacidade e Segurança → Modo de Desenvolvedor* e confie
no certificado em *Ajustes → Geral → VPN e Gerenciamento de Dispositivos*.
Sem aparelho, `npx expo run:ios` (sem `--device`) abre no Simulador.

Instale sempre em **Release** (o comando acima): o JavaScript vai dentro do
app, que abre sem o Mac e recebe os updates do canal. O botão Run do Xcode
compila em **Debug**, que busca o JavaScript no Metro do Mac; sem ele, o app
abre na tela vermelha *"No script URL provided… unsanitizedScriptURLString =
(null)"*, e mesmo com ele tudo roda mais lento (animações incluídas). Para
usar o Xcode, troque antes em *Product → Scheme → Edit Scheme… → Run → Build
Configuration* para **Release**.

## Notificações push (Firebase)

O push do Android passa pelo FCM. Sem esta configuração o app funciona, mas
não recebe push: o log mostra `Default FirebaseApp is not initialized` e
nenhum aparelho é registrado.

1. [Firebase Console](https://console.firebase.google.com) → criar projeto
   → **Adicionar app → Android**, pacote `org.turingusp.uspapo` → baixar o
   `google-services.json`.
2. Builds locais: salve o arquivo na raiz deste repositório
   (`app.config.js` o encontra sozinho). Builds no EAS: crie a variável de
   arquivo
   `npx eas-cli env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --environment preview`
   (e `production`).
3. Firebase → Configurações do projeto → **Contas de serviço** → *Gerar nova
   chave privada*. Envie o JSON ao Expo:
   `npx eas-cli credentials` → Android → *Google Service Account* →
   *FCM V1*. É com essa chave que o servidor da Expo entrega o push.
4. Gere um **APK novo**: o `google-services.json` vai dentro do binário.
5. Opcional: se ativar *Enhanced Security for Push Notifications* no
   expo.dev, coloque o token de acesso em `EXPO_ACCESS_TOKEN` no Render.

Para testar, faça uma pergunta, feche o app e espere: o backend grava a
resposta e manda "Sua resposta está pronta". Os tokens ficam em
`dispositivos`; o backend apaga os que a Expo diz que não existem mais.

## Comunicados (novidades e avisos)

Um comunicado aparece no app sem atualização nenhuma. Pela linha de comando
(no repositório do backend, com a service key):

```bash
export SUPABASE_URL=https://<projeto>.supabase.co SUPABASE_SERVICE_KEY=...
python scripts/comunicados.py publicar novidade "Novidades do USPapo" novidades.md --imagem tela.png
python scripts/comunicados.py publicar aviso "Manutenção programada" manutencao.md \
  --pilula "USPapo entrará em manutenção" --imagem horario.png --fim 2026-10-04T04:00-03:00
python scripts/comunicados.py listar
python scripts/comunicados.py retirar 3f2a      # id ou começo do id
python scripts/comunicados.py remover 3f2a      # só depois de retirar: apaga linha e imagens
```

Ou pelo Dashboard: suba as imagens no bucket **comunicados** (Storage) e
insira uma linha em `comunicados` (Table Editor):

| Coluna | O que colocar |
|---|---|
| `tipo` | `novidade` (vidro gigante, abre uma vez) ou `aviso` (pílula que abre o vidro) |
| `titulo` | até 120 caracteres |
| `texto` | Markdown (negrito, listas, links, tabelas) |
| `imagens` | novidade e aviso: até 6, caminhos dentro do bucket (`2026-10-01-novidades/tela.png`) ou URLs completas |
| `pilula` | só para aviso: o texto curto da pílula (até 60 caracteres) |
| `plataformas` | vazio = todas; ou `{android}`, `{web}`, `{android,ios}` |
| `inicio` / `fim` | quando entra e sai do ar (vazio = agora / nunca) |
| `ativo` | `false` retira o comunicado |

**Retirar:** `retirar` (ou `ativo = false`) tira o comunicado em até ~2
minutos. O app relê a lista ao voltar para ele e a cada 2 minutos: a pílula
some e o vidro aberto fecha. Uma novidade já vista não volta a abrir.

**Remover de vez:** `remover` apaga do banco um comunicado já retirado e as
imagens dele no bucket (mantém as que outro comunicado também usa). Com o
comunicado ainda ativo, ele recusa: retire antes. Pede o id curto como
confirmação (`--sim` pula a pergunta).

Imagens de fora do Supabase não carregam no site (a CSP só libera o
projeto): use o bucket.

## Publicar uma atualização OTA

```bash
npm run update:preview -- --message "o que mudou"      # quem tem o APK de teste
npm run update:production -- --message "o que mudou"   # quem instalou pela loja
```

O app baixa o update na primeira abertura e passa a usá-lo na seguinte. Em
**Configurações** aparece o id do update em uso. Se o bundle novo quebrar na
abertura, o `expo-updates` volta sozinho para a versão anterior.

`scripts/update.sh` carrega o `.env.production` porque, com
`--environment`, o `eas-cli` ignora arquivos `.env`. Sem isso o bundle sai
sem a configuração do Supabase e quebra ao abrir.

**Só JavaScript, estilos e imagens usadas pelo JS vão por OTA.** Tudo que
muda o *fingerprint* exige um binário novo: dependência com código nativo,
plugins e campos nativos do `app.json`, ícone e splash, `eas.json`, versão do
Expo. Scripts npm e `.gitignore` estão fora do fingerprint
(`fingerprint.config.js`). Para conferir antes de publicar:

```bash
EXPO_UPDATES_CHANNEL=preview npx expo-updates runtimeversion:resolve --platform android
```

O valor tem que ser igual ao do binário instalado. O `eas update` mostra o
runtime de cada plataforma ao publicar.

Para desfazer um update: `npx eas-cli update:republish --group <id anterior>`
(os ids aparecem em `npx eas-cli update:list --branch <canal>`).

## Publicar nas lojas

```bash
npx eas-cli build --profile production --platform android   # AAB, versão incrementada no EAS
npx eas-cli submit --profile production --platform android
```

O mesmo vale para `--platform ios` (exige conta Apple Developer).

## Site

Merge em `main` → o Vercel instala (`npm ci`), gera (`npm run export:web`) e
publica `dist/`. Para testar o build de produção localmente:

```bash
npm run export:web && npx serve dist --single
```

Ao mudar o domínio ou criar um novo ambiente web:

1. Supabase → Authentication → URL Configuration → *Redirect URLs*:
   `https://<domínio>` e `https://<domínio>/**` (e `uspapofe://**` para o
   app). O app sempre informa o destino (cadastro, Google, redefinir
   senha), e o Supabase só o aceita se estiver nessa lista; senão manda o
   usuário para a *Site URL*. **Não mude a Site URL**: o projeto é
   compartilhado e ela é o link padrão dos emails dos outros serviços do
   Turing (`https://turingusp.com/`).
2. Render → `CORS_ORIGINS` do backend com o domínio novo.
3. Vercel → Settings → Domains.

A CSP em `vercel.json` só libera o próprio site e o Supabase. Qualquer
domínio novo que o navegador precise acessar (imagens, APIs) tem que entrar
lá.

## Login com Google e senha

O código já existe (`lib/auth.ts`, telas de login, cadastro, `/reset` e
Ajustes > Conta); o que falta é configuração no Supabase, que é compartilhado
com outros serviços do Turing.

- **Google:** o projeto já tem o provedor ligado com um client OAuth do
  Turing (o fluxo chega à tela de contas do Google). O botão só aparece
  quando `/auth/v1/settings` diz `google: true`, então ligar ou desligar o
  provedor no Supabase muda o app sem atualização. Se o login terminar em
  "acesso bloqueado" ou "app em teste", quem administra aquele projeto no
  Google Cloud precisa publicar a tela de consentimento (Audience → Publish
  app). Para um client próprio do USPapo: Google Auth Platform → Clients →
  Web application, com o redirect
  `https://zgvbnmovongrigjoviyu.supabase.co/auth/v1/callback`, e o ID e o
  segredo em Supabase → Authentication → Sign In / Providers → Google. O
  app não precisa de client Android/iOS nem de SHA-1: o login abre o
  navegador e volta pelo deep link `uspapofe://auth/callback`.
- **Redirect URLs** (Authentication → URL Configuration):
  `https://uspapo.turingusp.com` (Google na web e o link de nova senha) e
  `uspapofe://**` (Google no app). Sem o `uspapofe://**`, o Google no app
  termina no site do Turing (`turingusp.com/?code=…`) e não entra. Não mude
  a Site URL.
- **Esqueci a senha** termina sempre no site, de qualquer aparelho: o app e
  o site pedem o e-mail a `/auth/v1/recover` sem PKCE e com destino na
  origem do site, então o link traz a sessão no fragmento da URL (que o
  navegador não envia a ninguém). O site abre essa sessão antes de qualquer
  rota (`app/_layout.tsx`), leva a `/reset` e lá se cria a nova senha; um
  link vencido ou já usado cai em `/reset` pedindo outro. Se o link do
  e-mail levar ao site do Turing mesmo assim, o template *Reset Password*
  do projeto não usa `{{ .ConfirmationURL }}` (que respeita o destino). O
  SMTP padrão do Supabase só entrega para a equipe do projeto e com limite
  baixo; os e-mails do projeto próprio estão em
  `USPapo-Backend/supabase/templates/`.
- **Alterar senha** (Ajustes > Conta) não usa e-mail: confere a senha
  atual entrando de novo e troca em seguida. Uma conta que só entra com o
  Google cria a primeira senha ali.

## Mapa do campus

A base do mapa inline (`assets/mapa/campus.json`) é gerada do
OpenStreetMap. Para atualizar depois de obras ou de uma revisão no OSM:

```bash
node scripts/mapa-campus.mjs            # baixa do Overpass (tenta 4 vezes)
node scripts/mapa-campus.mjs base.json  # ou reaproveita uma resposta salva
```

O arquivo vai junto do JavaScript: chega por OTA, sem APK novo. Os dados
são © OpenStreetMap (ODbL), creditados na legenda do mapa.

## Tarefas de código

- **Tela nova:** crie o arquivo em `app/(main)/` (a rota sai do nome) e, se
  precisar, um item na gaveta em `components/Chrome.tsx`.
- **Ferramenta nova no backend:** rótulo e descrição em `FERRAMENTAS`
  (`lib/api.ts`).
- **Cores e vidro:** só cores da paleta do manual (`theme/paleta.ts`) e,
  para variar, só a opacidade (`alfa`); os papéis de cada tema ficam em
  `theme/index.tsx`, e os componentes usam `useTheme()`.
- **Antes de abrir PR:** `npm run typecheck && npm run lint && npm test`.
