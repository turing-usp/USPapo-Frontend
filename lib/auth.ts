/**
 * Auth helpers: pt-BR error mapping (no raw codes, no enumeration hints), the
 * live password checklist, "Continuar com o Google" and changing the password.
 *
 * Google: web is a full-page redirect back to the origin (detectSessionInUrl
 * exchanges the PKCE code); native opens the system browser and waits for the
 * `uspapofe://auth/callback` deep link. Both targets must be listed in Supabase
 * Auth > URL Configuration > Redirect URLs.
 */
import * as Linking from 'expo-linking';
import { AppState, Platform } from 'react-native';

import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from './supabase';

const ERROS: Record<string, string> = {
  email_not_confirmed: 'Confira seu e-mail para ativar a conta',
  invalid_credentials: 'E-mail ou senha incorretos',
  user_already_exists: 'Este e-mail já está cadastrado',
  over_email_send_rate_limit: 'Muitas tentativas. Espere alguns minutos e tente de novo',
  over_request_rate_limit: 'Muitas tentativas. Espere alguns minutos e tente de novo',
  same_password: 'A nova senha precisa ser diferente da atual',
  session_expired: 'Sua sessão expirou',
  reauthentication_needed: 'Por segurança, entre de novo na conta antes de trocar a senha',
};
const REDE = 'Verifique sua conexão e tente de novo';
const SENHA_FRACA: Record<string, string> = {
  length: 'A senha precisa ser mais longa',
  characters: 'A senha precisa combinar letras maiúsculas e minúsculas, números e símbolos',
  pwned: 'Esta senha já vazou em alguma lista pública, escolha outra',
};

export function mapAuthError(err: unknown): string {
  if (err instanceof TypeError) return REDE;
  const e = (typeof err === 'object' && err ? err : {}) as { code?: unknown; name?: unknown; message?: unknown; reasons?: unknown };
  if (e.name === 'AuthRetryableFetchError') return REDE;
  if (typeof e.message === 'string' && e.message.includes('Sua sessão expirou')) return 'Sua sessão expirou';
  if (e.code === 'weak_password') {
    const motivos = (Array.isArray(e.reasons) ? e.reasons : []).map((r) => SENHA_FRACA[String(r)]).filter(Boolean);
    return motivos.length ? motivos.join('. ') : 'A senha é muito fraca. Use mais letras, números e símbolos.';
  }
  return (typeof e.code === 'string' && ERROS[e.code]) || 'Algo deu errado, tente de novo';
}

export const REGRAS_DE_SENHA: [string, (s: string) => boolean][] = [
  ['Pelo menos 8 caracteres', (s) => s.length >= 8],
  ['Uma letra maiúscula', (s) => /[A-Z]/.test(s)],
  ['Uma letra minúscula', (s) => /[a-z]/.test(s)],
  ['Um número', (s) => /[0-9]/.test(s)],
  ['Um caractere especial', (s) => /[^A-Za-z0-9]/.test(s)],
];
export const senhaValida = (s: string) => REGRAS_DE_SENHA.every(([, ok]) => ok(s));

export type ResultadoOAuth = { ok: true } | { ok: false; cancelado: boolean; mensagem?: string };

/** Where the provider sends the user back (web origin, or the app deep link). */
export function urlDeRetorno(): string {
  return Platform.OS === 'web' ? globalThis.location?.origin ?? '' : Linking.createURL('/auth/callback');
}

function parametro(url: string, nome: string): string | null {
  const consulta = `${url.split('?')[1] ?? ''}&${url.split('#')[1] ?? ''}`;
  for (const par of consulta.split(/[&#]/)) {
    const [chave, valor] = par.split('=');
    if (chave === nome && valor) return decodeURIComponent(valor.replace(/\+/g, ' '));
  }
  return null;
}

/** Opens `url` and resolves with the redirect, or null when the user came back without finishing. */
async function abrirEEsperar(url: string): Promise<string | null> {
  let resolver: (v: string | null) => void = () => undefined;
  const espera = new Promise<string | null>((r) => (resolver = r));
  let saiu = false;
  let desistir: ReturnType<typeof setTimeout> | undefined;
  const link = Linking.addEventListener('url', ({ url: volta }) => resolver(volta));
  const estado = AppState.addEventListener('change', (novo) => {
    if (novo !== 'active') saiu = true;
    else if (saiu) desistir = setTimeout(() => resolver(null), 1200); // the deep link may lag the foreground event
  });
  try {
    return (await Linking.openURL(url).then(() => true, () => false)) ? await espera : null;
  } finally {
    clearTimeout(desistir);
    link.remove();
    estado.remove();
  }
}

export async function entrarComGoogle(): Promise<ResultadoOAuth> {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: urlDeRetorno(), skipBrowserRedirect: Platform.OS !== 'web', queryParams: { prompt: 'select_account' } },
    });
    if (error) return { ok: false, cancelado: false, mensagem: mapAuthError(error) };
    if (Platform.OS === 'web') return { ok: true };
    const volta = data?.url ? await abrirEEsperar(data.url) : null;
    if (!volta) return { ok: false, cancelado: true };
    const recusa = parametro(volta, 'error');
    if (recusa) {
      return recusa === 'access_denied' ? { ok: false, cancelado: true }
        : { ok: false, cancelado: false, mensagem: 'Não foi possível entrar com o Google. Tente de novo.' };
    }
    const codigo = parametro(volta, 'code');
    if (!codigo) return { ok: false, cancelado: true };
    const troca = await supabase.auth.exchangeCodeForSession(codigo);
    return troca.error ? { ok: false, cancelado: false, mensagem: mapAuthError(troca.error) } : { ok: true };
  } catch (err) {
    return { ok: false, cancelado: false, mensagem: mapAuthError(err) };
  }
}

/** The signed-in user's id and access token ('' when there is no session). */
export async function sessaoAtual(): Promise<{ userId: string; token: string }> {
  const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
  return { userId: data.session?.user?.id ?? '', token: data.session?.access_token ?? '' };
}

let google: Promise<boolean> | null = null;

/**
 * Whether the Supabase project has Google sign-in on (its public /auth/v1/settings). The button
 * only shows where it can work, and appears on its own once the project turns Google on. If the
 * check cannot run, the button shows (and asks again next time).
 */
export function googleAtivo(): Promise<boolean> {
  google ??= fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_ANON_KEY ?? '' } })
    .then(async (res) => (res.ok ? Boolean(((await res.json()) as { external?: { google?: boolean } }).external?.google) : true))
    .catch(() => {
      google = null;
      return true;
    });
  return google;
}

/** How the signed-in account signs in: with a password (e-mail account) and/or with Google. */
export type ContaDeLogin = { email: string; temSenha: boolean; google: boolean };

export async function contaDeLogin(): Promise<ContaDeLogin | null> {
  const { data } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
  if (!data.user?.email) return null;
  const provedores = new Set((data.user.identities ?? []).map((i) => i.provider));
  return { email: data.user.email, temSenha: provedores.has('email'), google: provedores.has('google') };
}

/**
 * Sets a new password; null on success, else the message to show. With `atual` (an account that
 * has a password) it is checked first by signing in again, which also counts as the recent login
 * Supabase asks for before a password change. A Google-only account creates its first password.
 */
export async function trocarSenha(email: string, atual: string | null, nova: string): Promise<string | null> {
  try {
    if (atual !== null) {
      const { error } = await supabase.auth.signInWithPassword({ email, password: atual });
      if (error) return error.code === 'invalid_credentials' ? 'A senha atual está incorreta' : mapAuthError(error);
    }
    const { error } = await supabase.auth.updateUser({ password: nova, ...(atual !== null ? { current_password: atual } : {}) });
    return error ? mapAuthError(error) : null;
  } catch (err) {
    return mapAuthError(err);
  }
}
