/**
 * Auth error → pt-BR message mapping (uniform surface: no raw English
 * Supabase codes leak to the UI, and no enumeration hints either).
 *
 * Port of the old site/lib/auth.ts table, extended with the codes the
 * rewritten app actually receives (Supabase AuthError `code` values plus the
 * synthetic network/session cases). `lib/api.ts` throws
 * `Error('Sua sessão expirou')` when the session token is gone; that message
 * is already pt-BR and is passed through untouched.
 */

export const AUTH_ERRORS: Record<string, string> = {
  email_not_confirmed: 'Confira seu e-mail para ativar a conta',
  invalid_credentials: 'E-mail ou senha incorretos',
  user_already_exists: 'Este e-mail já está cadastrado',
  session_expired: 'Sua sessão expirou',
  /** Synthetic code for network failures (kept from the old site). */
  rede_indisponivel: 'Verifique sua conexão e tente de novo',
  network: 'Verifique sua conexão e tente de novo',
};

/**
 * Specific pt-BR wording for each `weak_password.reasons` token
 * (supabase-js 2.x: `AuthWeakPasswordError.reasons:
 * ('length' | 'characters' | 'pwned')[]`).
 */
const WEAK_PASSWORD_REASONS: Record<string, string> = {
  length: 'A senha precisa ser mais longa',
  characters:
    'A senha precisa combinar letras maiúsculas e minúsculas, números e símbolos',
  pwned: 'Esta senha já vazou em alguma lista pública, escolha outra',
};

const WEAK_PASSWORD_FALLBACK =
  'A senha é muito fraca. Use mais letras, números e símbolos.';

const DEFAULT_MESSAGE = 'Algo deu errado, tente de novo';

type AuthLikeError = {
  code?: unknown;
  message?: unknown;
  name?: unknown;
  reasons?: unknown;
};

function asAuthError(err: unknown): AuthLikeError | null {
  if (typeof err === 'object' && err !== null) return err as AuthLikeError;
  return null;
}

/**
 * Maps any auth failure to the uniform pt-BR message for the UI:
 *
 * - coded AuthError → the table (weak_password uses the specific reasons
 *   when the server sent them);
 * - network/fetch failure (raw `TypeError` or supabase-js
 *   `AuthRetryableFetchError`) → the connection message;
 * - the "Sua sessão expirou" message from lib/api → passed through;
 * - anything else → the default message.
 */
export function mapAuthError(err: unknown): string {
  // Network failures surface as a raw TypeError (fetch) or as
  // supabase-js's AuthRetryableFetchError, not as a coded AuthError.
  if (err instanceof TypeError) return AUTH_ERRORS.rede_indisponivel;

  const e = asAuthError(err);
  if (!e) return DEFAULT_MESSAGE;

  if (e.name === 'AuthRetryableFetchError') return AUTH_ERRORS.rede_indisponivel;

  // lib/api.ts throws exactly this message when the token is gone.
  if (
    typeof e.message === 'string' &&
    e.message.includes('Sua sessão expirou')
  ) {
    return 'Sua sessão expirou';
  }

  if (e.code === 'weak_password') {
    const reasons = Array.isArray(e.reasons) ? e.reasons.map(String) : [];
    const mapped = reasons
      .map((reason) => WEAK_PASSWORD_REASONS[reason])
      .filter((message): message is string => Boolean(message));
    return mapped.length > 0 ? mapped.join('. ') : WEAK_PASSWORD_FALLBACK;
  }

  if (typeof e.code === 'string' && AUTH_ERRORS[e.code]) {
    return AUTH_ERRORS[e.code];
  }

  return DEFAULT_MESSAGE;
}
