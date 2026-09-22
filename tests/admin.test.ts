import { diaCurto, duracao, numero, porcento, segundos } from '../lib/admin';

jest.mock('../lib/supabase', () => ({ supabase: {} }));

test('panel formatters', () => {
  expect(numero(1234)).toBe('1.234');
  expect(numero(16000)).toMatch(/16\s?mil/);
  expect(porcento(0.5)).toBe('50%');
  expect(porcento(null)).toBe('—');
  expect(duracao(0)).toBe('—');
  expect(duracao(1500)).toBe('1.5 s');
  expect(segundos(500)).toBe('0.5 s');
  expect(diaCurto('2026-09-22')).toBe('22/09');
});
