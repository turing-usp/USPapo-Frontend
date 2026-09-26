/**
 * Conversation deletes with an undo window. The pending deletes live here, not in the history
 * screen: a pushed screen stays mounted, so leaving it never unmounted anything and the delete
 * could land after another screen had already listed the conversation again. Leaving the history
 * or the app commits every pending delete at once; lists skip what is still pending.
 */
import { AppState } from 'react-native';

import { esquecerConversa } from './cache';
import { excluir } from './conversations';

type Pendente = { userId: string; timer: ReturnType<typeof setTimeout>; aoEfetivar?: () => void; aoFalhar?: () => void };

const pendentes = new Map<string, Pendente>();
let vigia: { remove: () => void } | null = null;

export const exclusaoPendente = (id: string) => pendentes.has(id);

export function agendarExclusao(userId: string, id: string, janela: number, avisos: Pick<Pendente, 'aoEfetivar' | 'aoFalhar'> = {}): void {
  desfazerExclusao(id);
  pendentes.set(id, { userId, ...avisos, timer: setTimeout(() => void efetivar(id), janela) });
  vigia ??= AppState.addEventListener('change', (estado) => {
    if (estado !== 'active') void efetivarExclusoes();
  });
}

/** Cancels a pending delete; false when it already ran. */
export function desfazerExclusao(id: string): boolean {
  const pendente = pendentes.get(id);
  if (!pendente) return false;
  clearTimeout(pendente.timer);
  pendentes.delete(id);
  return true;
}

async function efetivar(id: string): Promise<void> {
  const pendente = pendentes.get(id);
  if (!pendente) return;
  clearTimeout(pendente.timer);
  pendentes.delete(id);
  try {
    await excluir(pendente.userId, id);
    await esquecerConversa(pendente.userId, id);
    pendente.aoEfetivar?.();
  } catch {
    pendente.aoFalhar?.();
  }
}

export async function efetivarExclusoes(): Promise<void> {
  await Promise.all([...pendentes.keys()].map(efetivar));
}
