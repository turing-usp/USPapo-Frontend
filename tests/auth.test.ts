import { contaDeLogin, googleAtivo, mapAuthError, senhaValida, trocarSenha } from '../lib/auth';
import { supabase } from '../lib/supabase';

jest.mock('../lib/supabase', () => ({
  supabase: { auth: { signInWithPassword: jest.fn(), updateUser: jest.fn(), getUser: jest.fn() } },
  SUPABASE_URL: 'http://supabase.test',
  SUPABASE_ANON_KEY: 'anon',
}));
const mockAuth = supabase.auth as unknown as Record<'signInWithPassword' | 'updateUser' | 'getUser', jest.Mock>;

beforeEach(() => Object.values(mockAuth).forEach((f) => f.mockReset()));

test('auth errors never leak raw codes', () => {
  expect(mapAuthError({ code: 'invalid_credentials' })).toBe('E-mail ou senha incorretos');
  expect(mapAuthError({ code: 'weak_password', reasons: ['length', 'pwned'] })).toContain('mais longa');
  expect(mapAuthError(new TypeError('fetch failed'))).toBe('Verifique sua conexão e tente de novo');
  expect(mapAuthError({ code: 'something_new' })).toBe('Algo deu errado, tente de novo');
});

test('password rules', () => {
  expect(senhaValida('Senha#Forte123')).toBe(true);
  expect(senhaValida('senhafraca')).toBe(false);
});

test('changing the password checks the current one first', async () => {
  mockAuth.signInWithPassword.mockResolvedValueOnce({ error: { code: 'invalid_credentials' } });
  expect(await trocarSenha('a@usp.br', 'errada', 'Nova#Senha1')).toBe('A senha atual está incorreta');
  expect(mockAuth.updateUser).not.toHaveBeenCalled();

  mockAuth.signInWithPassword.mockResolvedValueOnce({ error: null });
  mockAuth.updateUser.mockResolvedValueOnce({ error: null });
  expect(await trocarSenha('a@usp.br', 'Atual#1x', 'Nova#Senha1')).toBeNull();
  expect(mockAuth.updateUser).toHaveBeenCalledWith({ password: 'Nova#Senha1', current_password: 'Atual#1x' });
});

test('a Google-only account creates its first password', async () => {
  mockAuth.getUser.mockResolvedValueOnce({ data: { user: { email: 'a@usp.br', identities: [{ provider: 'google' }] } } });
  expect(await contaDeLogin()).toEqual({ email: 'a@usp.br', temSenha: false, google: true });
  mockAuth.updateUser.mockResolvedValueOnce({ error: { code: 'weak_password', reasons: ['characters'] } });
  expect(await trocarSenha('a@usp.br', null, 'fraca')).toContain('maiúsculas');
  expect(mockAuth.signInWithPassword).not.toHaveBeenCalled();
});

test('the Google button follows the project settings', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ external: { google: false, email: true } }));
  expect(await googleAtivo()).toBe(false);
  expect(await googleAtivo()).toBe(false); // asked once
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith('http://supabase.test/auth/v1/settings', { headers: { apikey: 'anon' } });
  fetch.mockRestore();
});
