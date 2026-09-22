/**
 * Conversation store over Supabase (tables shared with the old site, RLS: owner only).
 *
 *   conversas  id, user_id, titulo, criada_em, atualizada_em, favorita
 *   mensagens  conversa_id, ordem, pergunta, resposta (null = pending), fontes, criada_em
 *
 * A turn is inserted with `resposta = null` when sent and completed only on a
 * successful stream end, filtered on `resposta IS NULL` so a saved answer is never
 * overwritten. Writes raise; a failed turns read only costs the turns.
 */
import { supabase } from './supabase';

export type Mensagem = { ordem: number; pergunta: string; resposta: string | null; fontes: string[] };
export type Conversa = {
  id: string;
  titulo: string;
  mensagens: Mensagem[];
  /** First question (the history label fallback). */
  pergunta: string;
  /** Last answer; null while the last turn is pending. */
  resposta: string | null;
  criada_em: string;
  atualizada_em: string;
  favorita: boolean;
};

export const LIMITE_HISTORICO = 30;
const COLUNAS = 'id,titulo,criada_em,atualizada_em,favorita';
const COLUNAS_MENSAGEM = 'conversa_id,pergunta,resposta,ordem,fontes';
const TITULO_MAX = 80;

/** The title, unless it is just the old site's truncated question (then the full question). */
export function rotuloDa(c: Pick<Conversa, 'titulo' | 'pergunta'>): string {
  const titulo = c.titulo.trim();
  const pergunta = c.pergunta.trim();
  const semCorte = titulo.replace(/(\.\.\.|…)$/, '').trim();
  if (!titulo) return pergunta;
  return pergunta && semCorte && pergunta.startsWith(semCorte) ? pergunta : titulo;
}

function falhou(operacao: string, error: { message?: string } | null): void {
  if (!error) return;
  console.error(`[conversas] ${operacao} falhou:`, error);
  throw new Error('A operação falhou: não foi possível salvar a conversa');
}

const paraMensagem = (m: Record<string, unknown>): Mensagem => ({
  ordem: Number(m.ordem ?? 0),
  pergunta: String(m.pergunta ?? ''),
  resposta: m.resposta == null ? null : String(m.resposta),
  fontes: Array.isArray(m.fontes) ? m.fontes.map(String) : [],
});

function paraConversa(linha: Record<string, unknown>, mensagens: Mensagem[]): Conversa {
  const ordenadas = [...mensagens].sort((a, b) => a.ordem - b.ordem);
  return {
    id: String(linha.id),
    titulo: String(linha.titulo ?? ''),
    mensagens: ordenadas,
    pergunta: ordenadas[0]?.pergunta ?? String(linha.titulo ?? ''),
    resposta: ordenadas.length ? ordenadas[ordenadas.length - 1].resposta : null,
    criada_em: String(linha.criada_em ?? ''),
    atualizada_em: String(linha.atualizada_em ?? ''),
    favorita: linha.favorita === true,
  };
}

async function turnos(ids: string[]): Promise<Map<string, Mensagem[]>> {
  const { data, error } = await supabase.from('mensagens').select(COLUNAS_MENSAGEM).in('conversa_id', ids).order('ordem');
  const mapa = new Map<string, Mensagem[]>();
  if (error) console.error('[conversas] turnos indisponíveis:', error);
  for (const m of (error ? [] : data ?? []) as Record<string, unknown>[]) {
    const id = String(m.conversa_id);
    mapa.set(id, [...(mapa.get(id) ?? []), paraMensagem(m)]);
  }
  return mapa;
}

/** The last `limite` conversations, newest first, each with all its turns. */
export async function lerHistorico(userId: string, limite = LIMITE_HISTORICO): Promise<Conversa[]> {
  const { data, error } = await supabase.from('conversas').select(COLUNAS).eq('user_id', userId)
    .order('atualizada_em', { ascending: false }).limit(limite);
  falhou('lerHistorico', error);
  const linhas = (data ?? []) as Record<string, unknown>[];
  if (!linhas.length) return [];
  const mapa = await turnos(linhas.map((l) => String(l.id)));
  return linhas.map((l) => paraConversa(l, mapa.get(String(l.id)) ?? []));
}

export async function lerConversa(userId: string, id: string): Promise<Conversa | null> {
  const { data, error } = await supabase.from('conversas').select(COLUNAS).eq('user_id', userId).eq('id', id).limit(1);
  falhou('lerConversa', error);
  const linha = (data ?? [])[0] as Record<string, unknown> | undefined;
  return linha ? paraConversa(linha, (await turnos([id])).get(id) ?? []) : null;
}

/** Insert that tolerates the row already existing (without relying on a matching unique index). */
async function inserirUmaVez(tabela: string, linha: Record<string, unknown>, conflito: string) {
  const { error } = await supabase.from(tabela).upsert(linha, { onConflict: conflito, ignoreDuplicates: true });
  if (error?.code !== '42P10') return error; // 42P10: no unique index for ON CONFLICT
  const res = await supabase.from(tabela).insert(linha);
  return res.error?.code === '23505' ? null : res.error;
}

/**
 * Sends a turn (no `resposta`: idempotent insert of the pending turn, creating the
 * conversation on turn 0) or completes it (only while still pending).
 */
export async function anexarMensagem(
  userId: string,
  id: string,
  turno: { ordem: number; pergunta: string; resposta?: string; fontes?: string[] },
): Promise<void> {
  const agora = new Date().toISOString();
  if (turno.resposta === undefined) {
    if (turno.ordem === 0) {
      const titulo = turno.pergunta.trim().replace(/\s+/g, ' ');
      falhou('anexar (conversa)', await inserirUmaVez('conversas', {
        id, user_id: userId, favorita: false, criada_em: agora, atualizada_em: agora,
        titulo: titulo.length <= TITULO_MAX ? titulo : `${titulo.slice(0, TITULO_MAX - 1)}…`,
      }, 'id'));
    }
    falhou('anexar (pergunta)', await inserirUmaVez('mensagens', {
      conversa_id: id, ordem: turno.ordem, pergunta: turno.pergunta, resposta: null, criada_em: agora,
    }, 'conversa_id,ordem'));
  } else {
    const { error } = await supabase.from('mensagens')
      .update({ pergunta: turno.pergunta, resposta: turno.resposta, ...(turno.fontes ? { fontes: turno.fontes } : {}) })
      .eq('conversa_id', id).eq('ordem', turno.ordem).is('resposta', null);
    falhou('anexar (resposta)', error);
  }
  if (turno.ordem > 0 || turno.resposta !== undefined) {
    const { error } = await supabase.from('conversas').update({ atualizada_em: agora }).eq('id', id).eq('user_id', userId);
    falhou('anexar (atualizada_em)', error);
  }
}

export async function renomear(userId: string, id: string, titulo: string): Promise<void> {
  if (!titulo.trim()) return;
  const { error } = await supabase.from('conversas').update({ titulo: titulo.trim() }).eq('id', id).eq('user_id', userId);
  falhou('renomear', error);
}

/** The 5-favorites cap is enforced by a DB trigger; its rejection is relayed. */
export async function favoritar(userId: string, id: string, valor: boolean): Promise<void> {
  const { error } = await supabase.from('conversas').update({ favorita: valor }).eq('id', id).eq('user_id', userId);
  if (error) {
    throw new Error(/favorit/i.test(error.message ?? '') ? 'Você já tem 5 conversas favoritas.' : 'Não foi possível favoritar a conversa.');
  }
}

export async function excluir(userId: string, id: string): Promise<void> {
  const { error } = await supabase.from('conversas').delete().eq('id', id).eq('user_id', userId);
  falhou('excluir', error);
}
