import { mapAuthError, senhaValida } from '../lib/auth';

jest.mock('../lib/supabase', () => ({ supabase: {} }));

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
