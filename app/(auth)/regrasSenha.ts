/**
 * Password checklist (live, 5 rules) shared by register and the reset step.
 *
 * Port of the old site's lib/auth.ts `checarSenha`/`validarCadastro` and of
 * the cadastro screen's labels — the exact pt-BR strings are the contract:
 * the server-side GoTrue hook is the source of truth for acceptance; this
 * checklist is UX only (plan §4, finding 007).
 */

export type RegraSenha = 'tamanho' | 'maiuscula' | 'minuscula' | 'numero' | 'especial';

export const REGRAS_DE_SENHA: { chave: RegraSenha; rotulo: string }[] = [
  { chave: 'tamanho', rotulo: 'Pelo menos 8 caracteres' },
  { chave: 'maiuscula', rotulo: 'Uma letra maiúscula' },
  { chave: 'minuscula', rotulo: 'Uma letra minúscula' },
  { chave: 'numero', rotulo: 'Um número' },
  { chave: 'especial', rotulo: 'Um caractere especial' },
];

export type ResultadoChecarSenha = Record<RegraSenha, boolean>;

export function checarSenha(senha: string): ResultadoChecarSenha {
  return {
    tamanho: senha.length >= 8,
    maiuscula: /[A-Z]/.test(senha),
    minuscula: /[a-z]/.test(senha),
    numero: /[0-9]/.test(senha),
    especial: /[^A-Za-z0-9]/.test(senha),
  };
}

export function todasAsRegrasPassam(senha: string): boolean {
  const resultado = checarSenha(senha);
  return Object.values(resultado).every(Boolean);
}
