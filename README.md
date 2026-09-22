# USPapo — Frontend

App do USPapo, o assistente de IA da USP feito pelo Turing USP. Um só código
Expo (React Native) gera o app Android, o app iOS e o site
[uspapo.turingusp.com](https://uspapo.turingusp.com).

- **Backend:** repositório `USPapo-Backend` (FastAPI no Render).
- **Login e dados:** Supabase (Auth + tabelas com RLS).
- **Mais detalhes:** [docs/arquitetura.md](docs/arquitetura.md) (como o app
  funciona) e [docs/fluxos.md](docs/fluxos.md) (APK, updates, deploy e
  tarefas comuns).

## Estrutura

```
app/                 rotas (expo-router); só telas, sem lógica de dados
  (auth)/            login, cadastro, redefinir senha
  (main)/            início, chat/[id], histórico, ajustes
  (admin)/           painel de métricas (só web, só admin)
components/          interface: ui.tsx (Texto, Botao, Campo…), Glass (vidro fosco),
                     Cena (fundo), Chrome (menu), Composer, charts, chat/
lib/                 dados e regras: api (SSE), chat (estado da conversa), conversations,
                     cache (leitura offline), auth, device (háptica, teclado, ditado),
                     markdown (LaTeX), admin, supabase
theme/               cores, espaçamento, tipografia, tokens de vidro, claro/escuro
tests/               jest (lib/, offline)
scripts/             pós-instalação (KaTeX) e cabeçalho do HTML web
public/              favicon, ícones e manifest do site
```

## Rodando localmente

Pré-requisitos: Node 22 e o backend rodando (veja o README do backend, que
também sobe o Supabase local e cria as contas de teste).

```bash
npm ci
cp .env.example .env    # para dev local: Supabase local + EXPO_PUBLIC_BACKEND_URL=http://127.0.0.1:8000
npm run web             # http://localhost:8081
npm run android         # compila e instala num emulador/aparelho (precisa do Android SDK)
```

Entre com `aluno@usp.br` / `Senha#Forte123` (ou `admin@usp.br` para ver o
painel). O `.env` é só para desenvolvimento: builds de release (APK, EAS,
Vercel) usam o `.env.production`, que aponta para produção.

## Verificações

```bash
npm run typecheck && npm run lint && npm test
```

O CI (`.github/workflows/testes.yml`) roda as três em todo push e PR.

## Publicação

| Onde | Como |
|---|---|
| Site | merge em `main` → Vercel roda `npm run export:web` (config em `vercel.json`) |
| APK de teste | `npm run apk:preview` → `android/app/build/outputs/apk/release/app-release.apk` |
| Atualização OTA | `npm run update:preview` (testadores) ou `npm run update:production` |
| Lojas | `eas build --profile production` + `eas submit` |

Mudanças só de JavaScript chegam aos apps por atualização OTA, sem
reinstalar. Mudanças nativas (dependência nativa, plugin, ícone, `app.json`)
mudam o *fingerprint* e exigem um binário novo. Veja
[docs/fluxos.md](docs/fluxos.md).

Fluxo de branches: pessoal → `dev` → `homolog` → `main`. Commits em inglês,
no padrão *conventional commits*.
