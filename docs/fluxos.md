# Fluxos comuns do frontend

## Ambientes

| Arquivo | Usado por | Aponta para |
|---|---|---|
| `.env` (não versionado) | `npm run web`, `npm run android` (dev) | o que você quiser; normalmente Supabase local + `http://127.0.0.1:8000` |
| `.env.production` (versionado) | APK, EAS Build, EAS Update, Vercel | Supabase de produção + backend no Render |

Tudo que começa com `EXPO_PUBLIC_` vai para dentro do app e é público por
definição (a chave anônima do Supabase depende de RLS, não de sigilo).
Nunca coloque segredos aqui.

## Testar no Android com o backend local

```bash
npm run android                      # build debug + Metro; precisa de emulador ou aparelho via USB
adb reverse tcp:54321 tcp:54321      # Supabase local
adb reverse tcp:8000 tcp:8000        # backend local
```

Com os `adb reverse`, o `127.0.0.1` do `.env` funciona dentro do emulador.
Builds debug aceitam HTTP; builds release não.

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

## Publicar uma atualização OTA

```bash
npm run update:preview -- --message "o que mudou"      # quem tem o APK de teste
npm run update:production -- --message "o que mudou"   # quem instalou pela loja
```

O app baixa o update na primeira abertura e passa a usá-lo na seguinte. Em
**Ajustes** aparece o id do update em uso. Se o bundle novo quebrar na
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

## Tarefas de código

- **Tela nova:** crie o arquivo em `app/(main)/` (a rota sai do nome) e, se
  precisar, um item na gaveta em `components/Chrome.tsx`.
- **Ferramenta nova no backend:** rótulo e descrição em `FERRAMENTAS`
  (`lib/api.ts`).
- **Cores e vidro:** só em `theme/index.tsx`; componentes usam `useTheme()`.
- **Antes de abrir PR:** `npm run typecheck && npm run lint && npm test`.
