/** Answer ratings in `mensagem_feedbacks`, keyed by (conversa_id, mensagem_ordem, user_id). */
import { supabase } from './supabase';

export type TipoFeedback = 'like' | 'dislike';
export type Feedback = { tipo: TipoFeedback; motivo: string | null; comentario: string | null };

const TABELA = 'mensagem_feedbacks';

/** Saves or re-saves one rating; false on failure (a rating never takes the answer down). */
export async function salvarFeedback(p: {
  userId: string; conversaId: string; ordem: number; tipo: TipoFeedback; motivo?: string; comentario?: string;
}): Promise<boolean> {
  const { error } = await supabase.from(TABELA).upsert(
    {
      conversa_id: p.conversaId, mensagem_ordem: p.ordem, user_id: p.userId, tipo: p.tipo,
      motivo: p.motivo?.trim() || null, comentario: p.comentario?.trim().slice(0, 2000) || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'conversa_id,mensagem_ordem,user_id' },
  );
  if (error) console.error('[feedback] salvar falhou:', error);
  return !error;
}

export async function removerFeedback(p: { userId: string; conversaId: string; ordem: number }): Promise<boolean> {
  const { error } = await supabase.from(TABELA).delete()
    .eq('conversa_id', p.conversaId).eq('mensagem_ordem', p.ordem).eq('user_id', p.userId);
  if (error) console.error('[feedback] remover falhou:', error);
  return !error;
}

/** Every rating the user left in one conversation, by turn order. */
export async function feedbacksDaConversa(userId: string, conversaId: string): Promise<Record<number, Feedback>> {
  const { data, error } = await supabase.from(TABELA).select('mensagem_ordem,tipo,motivo,comentario')
    .eq('conversa_id', conversaId).eq('user_id', userId);
  if (error) return {};
  const mapa: Record<number, Feedback> = {};
  for (const f of (data ?? []) as Record<string, unknown>[]) {
    if (f.tipo === 'like' || f.tipo === 'dislike') {
      mapa[Number(f.mensagem_ordem)] = {
        tipo: f.tipo, motivo: (f.motivo as string | null) ?? null, comentario: (f.comentario as string | null) ?? null,
      };
    }
  }
  return mapa;
}
