/**
 * "Continuar com o Google" — the whole flow, both platforms.
 *
 * This used to be a `console.log` placeholder on the login screen, so the
 * button did nothing at all: it depressed, and the student stayed on the
 * login screen with no session and no error to explain why.
 *
 * NO NEW DEPENDENCY, on purpose. The obvious implementation reaches for
 * `expo-web-browser`'s `openAuthSessionAsync`, but that is a NATIVE module and
 * this app ships over-the-air (`runtimeVersion.policy: "fingerprint"`): adding
 * an autolinked module changes the fingerprint, so the update would no longer
 * be delivered to the builds already on people's phones. Everything below is
 * built from `expo-linking` and `@supabase/supabase-js`, which are already in
 * the binary.
 *
 * WEB — full-page redirect, the flow the browser is built for:
 *   signInWithOAuth navigates to Supabase, Supabase to Google, and Google back
 *   to `window.location.origin`. `detectSessionInUrl` (lib/supabase, web only)
 *   consumes the `?code=` PKCE parameter and completes the exchange, which
 *   fires `SIGNED_IN` on the auth listener the root gate and the login screen
 *   are both subscribed to.
 *
 * NATIVE — system browser + deep link back:
 *   `skipBrowserRedirect` keeps supabase-js from trying to navigate a page
 *   that does not exist, the authorize URL is opened in the system browser,
 *   and the app waits for the redirect to deep-link back into
 *   `<scheme>://auth/callback`. The code in that URL is exchanged explicitly
 *   (`exchangeCodeForSession`), because `detectSessionInUrl` is off on native —
 *   there is no URL bar for it to read.
 *
 * SUPABASE DASHBOARD (one-time, outside this repo): the Google provider must
 * be enabled, and BOTH redirect targets must be in
 * Authentication → URL Configuration → Redirect URLs:
 *   - the web origin(s), e.g. `https://uspapo.turingusp.com/**`
 *   - the app deep link, `uspapofe://auth/callback` (the `scheme` in app.json)
 * A target that is not on that list comes back as `redirect_to` rejected, and
 * the student sees the generic failure message — the code cannot detect it.
 */
import * as Linking from 'expo-linking';
import { AppState, Platform } from 'react-native';

import { mapAuthError } from './auth';
import { supabase } from './supabase';

/** The path the provider redirects back to on native. */
export const CAMINHO_RETORNO = 'auth/callback';

/** What a sign-in attempt resolved to. */
export type ResultadoOAuth =
  | { ok: true }
  /** The student closed the browser / went back: not an error to shout about. */
  | { ok: false; cancelado: true }
  | { ok: false; cancelado: false; mensagem: string };

const CANCELADO: ResultadoOAuth = { ok: false, cancelado: true };

function falha(erro: unknown): ResultadoOAuth {
  return { ok: false, cancelado: false, mensagem: mapAuthError(erro) };
}

/**
 * Where the provider sends the student back to.
 *
 * Web: the origin, so the SPA shell reloads with the `?code=` on it (any
 * deeper path would need its own rewrite rule). Native: `Linking.createURL`,
 * which resolves to the `uspapofe://` scheme in a standalone build and to the
 * `exp://…` dev URL under Expo Go / a dev client — the same value the
 * dashboard's redirect list has to contain.
 */
export function urlDeRetorno(): string {
  if (Platform.OS === 'web') {
    const local = (globalThis as { location?: { origin?: string } }).location;
    return local?.origin ?? '';
  }
  return Linking.createURL(`/${CAMINHO_RETORNO}`);
}

/** The `code` (PKCE) of a redirect URL, or null when it carries none. */
export function codigoDaUrl(url: string): string | null {
  // Not `new URL`: a custom scheme (uspapofe://) is not parsed uniformly
  // across engines, and all this needs is one query parameter.
  const consulta = url.split('?')[1];
  if (!consulta) return null;
  for (const par of consulta.split('#')[0].split('&')) {
    const [chave, valor] = par.split('=');
    if (chave === 'code' && valor) return decodeURIComponent(valor);
  }
  return null;
}

/** The pt-BR message a provider error in the redirect URL should become. */
export function erroDaUrl(url: string): string | null {
  const consulta = `${url.split('?')[1] ?? ''}&${url.split('#')[1] ?? ''}`;
  for (const par of consulta.split('&')) {
    const [chave, valor] = par.split('=');
    if ((chave === 'error' || chave === 'error_code') && valor) {
      const bruto = decodeURIComponent(valor).replace(/\+/g, ' ');
      return bruto === 'access_denied'
        ? 'Você cancelou a entrada com o Google.'
        : 'Não foi possível entrar com o Google. Tente de novo.';
    }
  }
  return null;
}

/**
 * How long to keep waiting for the redirect after the app comes back to the
 * foreground. Returning to the app and the deep link arriving are two events
 * in a race, and on a fast flow the foreground one can win.
 */
const GRACA_APOS_VOLTAR_MS = 1200;

/**
 * Opens `url` in the system browser and resolves with the redirect that comes
 * back into the app, or null when the student never finished.
 *
 * The listener is registered BEFORE the browser opens: the redirect can land
 * while this promise is still being set up on a fast flow, and a listener
 * added afterwards would miss it.
 *
 * COMING BACK WITHOUT A REDIRECT IS AN ANSWER. Someone who swipes the browser
 * away, or taps back out of Google's account chooser, produces no deep link at
 * all — and a promise that only ever settles on a deep link would hang there
 * forever, leaving the sign-in button spinning with nothing on the way. The
 * app returning to the foreground is the signal that the flow is over, one way
 * or another; the grace period is there so a redirect that is a few hundred
 * milliseconds behind the foreground event still wins.
 */
async function abrirEEsperar(url: string): Promise<string | null> {
  let resolver: (valor: string | null) => void = () => undefined;
  let resolvido = false;
  const espera = new Promise<string | null>((resolve) => {
    resolver = (valor) => {
      if (resolvido) return;
      resolvido = true;
      resolve(valor);
    };
  });

  let desistir: ReturnType<typeof setTimeout> | null = null;
  const assinatura = Linking.addEventListener('url', ({ url: devolvida }) => {
    resolver(devolvida);
  });
  // Only a return from the background counts: AppState also fires 'active'
  // while the app is still in front, and that would cancel the flow before
  // the browser had even opened.
  let saiu = false;
  const estado = AppState.addEventListener('change', (novo) => {
    if (novo === 'background' || novo === 'inactive') {
      saiu = true;
      return;
    }
    if (novo !== 'active' || !saiu) return;
    if (desistir) clearTimeout(desistir);
    desistir = setTimeout(() => resolver(null), GRACA_APOS_VOLTAR_MS);
  });

  try {
    const abriu = await Linking.openURL(url).then(
      () => true,
      () => false,
    );
    if (!abriu) return null;
    return await espera;
  } finally {
    if (desistir) clearTimeout(desistir);
    assinatura.remove();
    estado.remove();
  }
}

/**
 * Signs in with Google.
 *
 * Web resolves `{ ok: true }` as soon as the redirect has been handed to the
 * browser — the page is leaving, and the session arrives on the way back
 * through the auth listener, not through this return value. Native resolves
 * only once the session actually exists.
 */
export async function entrarComGoogle(): Promise<ResultadoOAuth> {
  const redirectTo = urlDeRetorno();
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        // Web: let supabase-js navigate the page itself. Native: there is no
        // page to navigate, so the URL comes back here to be opened.
        skipBrowserRedirect: Platform.OS !== 'web',
        // `select_account` so a shared device does not silently reuse the
        // last Google account that signed in on it.
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error) return falha(error);

    if (Platform.OS === 'web') return { ok: true };

    const autorizacao = data?.url;
    if (!autorizacao) {
      return falha(new Error('sem url de autorização'));
    }

    const devolvida = await abrirEEsperar(autorizacao);
    if (!devolvida) return CANCELADO;

    const recusa = erroDaUrl(devolvida);
    if (recusa) {
      return recusa.startsWith('Você cancelou')
        ? CANCELADO
        : { ok: false, cancelado: false, mensagem: recusa };
    }

    const codigo = codigoDaUrl(devolvida);
    if (!codigo) return CANCELADO;

    const troca = await supabase.auth.exchangeCodeForSession(codigo);
    if (troca.error) return falha(troca.error);
    return { ok: true };
  } catch (err) {
    return falha(err);
  }
}
