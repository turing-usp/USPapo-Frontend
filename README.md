# USPapo — frontend

Expo app (Android + iOS + web) for the USPapo student assistant: the chat
with SSE streaming, the auth flow, the history with favorites, the settings,
and the web-only admin panel. This is the ground-up rewrite of the old
Next.js site (see `../.turing/plans/PLAN-20260919-0001-rewrite.md`).

All production actions (EAS, stores, DNS) are **pending user approval** and
live in `../CUTOVER_RUNBOOK.md` — nothing in this repo deploys.

## Layout

| Path | What |
|---|---|
| `app/` | expo-router routes: `(auth)` login/register/reset (5-rule live password checklist), `(main)` tabs — Início (composer + FAQ), Chat (nested stack, deep-linkable `chat/[id]`), Histórico, Ajustes — and `(admin)` (web only: analytics KPI panel + feedback) |
| `app/(main)/chat/useChat.ts` | the chat data seam: `send` fires the SSE stream (`lib/api`), reduces the 8-event contract into turns, handles 429 (retry-after) and 401 (fast-fail to login), persists turn-by-turn with the P9 pending rule (`resposta NULL = pending`, completion-only update) |
| `lib/api.ts` | the SSE client: `streamChat` (fetch + incremental `data:` parsing), the `ChatEvent` union mirroring the backend's event contract, `TOOL_LABELS`, `backendUrl()` (`EXPO_PUBLIC_BACKEND_URL`, default `http://127.0.0.1:8000`) |
| `lib/conversations.ts` | the conversation store over Supabase (`conversas`, RLS-owned): `lerHistorico` (last-30 window), `anexarTurno` (the pending rule), `favoritar` (5-favorites cap enforced server-side, rejections relayed as real errors), `excluir`, `buscar` |
| `lib/{supabase,auth,haptics,limits,net}.ts` | the Supabase client + `mapAuthError`, the haptic vocabulary (send/like/dislike/error/finished/favorite — no-op on web), the limits (20 conversations / 5 favorites / 30 history), the net queue |
| `theme/index.tsx` | the design tokens ported from the old `globals.css`: the calibrated palette (brand orange stable across schemes, 6-slot colorblind-safe chart palette), spacing/radius/typography, and the glass vocabulary — a single flat no-blur translucent surface (backdrop-filter doesn't port to RN), scheme-persisted in AsyncStorage (`theme:scheme`) with the device appearance as the `system` default |
| `components/chat/` | the bubble/feedback components + `<Matematica>` (the KaTeX WebView fallback: LaTeX in the answer renders via a self-contained WebView with the KaTeX CDN; raw-text fallback while streaming / on web) |
| `tests/` | jest (offline: fakes + mocked fetch): lib (api SSE parsing, conversations pending rule), chat (the useChat reducer: full event sequence, 429, 401, stop/abort, persistence), admin (KPI math, palette rule, empty/error states) |

## Run

```bash
npm ci
npm start            # expo start (metro)
```

- **Android/iOS**: dev build (NOT Expo Go — the device has no Expo Go and
  modern SDKs dropped it). `npx expo prebuild --platform android` +
  `cd android && ./gradlew assembleDebug` + `adb install` (the lab Tab is
  wired for USB; the toolchain lives in `/mnt/Shared/android-dev/env.sh`).
- **Web**: `npx expo start --web`; the admin group is web-only by design.
- **`.env`**: copy `.env.example`; `EXPO_PUBLIC_BACKEND_URL` must point at
  the backend the app can reach (127.0.0.1 for the metro dev machine, the
  LAN IP on a physical device). No secrets beyond the anon key.

## Gates

```bash
npx tsc --noEmit     # clean
npx jest             # all suites, offline
```

## Production boundary

EAS projects (`eas.json`), store listings, the Cloudflare Worker deploy and
the DNS cutover are step-by-step in `../CUTOVER_RUNBOOK.md`, every step
**PENDING USER APPROVAL**.
