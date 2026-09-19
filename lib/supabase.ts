/**
 * Supabase client (single source for the whole app).
 *
 * The URL and anon key come from the EXPO_PUBLIC_* environment variables,
 * inlined into the bundle at build time. The anon key is public by design —
 * the tables are protected by RLS. Missing values fail loudly at
 * construction, naming exactly which variable is absent (mirrors the old
 * site's credential check: the @supabase default error does not say which
 * one is missing).
 *
 * Session storage is AsyncStorage. `flowType: 'pkce'` is supported by the
 * installed supabase-js (2.116.x, GoTrueClientOptions.flowType), so it is
 * set explicitly instead of relying on the default.
 */
// The Expo runtime exposes EXPO_PUBLIC_* on `process.env`. This repo has no
// @types/node (the generated expo-env.d.ts only appears after the first
// `expo start`), so the global is typed locally for the typecheck.
declare const process: { env: Record<string, string | undefined> };

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  const missing = [
    !SUPABASE_URL && 'EXPO_PUBLIC_SUPABASE_URL',
    !SUPABASE_ANON_KEY && 'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  ]
    .filter(Boolean)
    .join(' e ');
  throw new Error(
    `${missing} não está(ão) definido(a) no ambiente. Preencha no .env ` +
      'e rode o app de novo: o valor é embutido no bundle no build, então ' +
      'mudar a variável depois não consome um build que já saiu.',
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Web reads the OAuth callback from the URL; native flows (Google via
    // expo-auth-session) deep-link back into the app instead.
    detectSessionInUrl: Platform.OS === 'web',
    // PKCE is supported by the installed supabase-js version.
    flowType: 'pkce',
  },
});
