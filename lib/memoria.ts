/**
 * Per-user memory across conversations (`memorias`, RLS: owner only).
 *
 *   memorias  user_id (pk), ativa, fatos (jsonb object, <= 2 KB), atualizada_em
 *
 * The backend writes `fatos` when the model calls `atualizar_memoria`; the app only
 * reads, toggles `ativa` and removes facts. A missing row means "on, empty". Until the
 * migration is applied the read answers null (unavailable) and the card stays hidden.
 */
import { supabase } from './supabase';

export type ChaveFato = 'curso' | 'unidade' | 'campus' | 'ingresso' | 'vinculo' | 'observacoes';
/** The stored object as is: unknown keys survive a write-back. */
export type Fatos = Record<string, unknown>;
export type Memoria = { ativa: boolean; fatos: Fatos };
/** One displayed fact; `indice` is the note's position in `observacoes`. */
export type ItemMemoria = { chave: ChaveFato; rotulo: string; valor: string; indice?: number };

const TABELA = 'memorias';
/** Display order and pt-BR labels. */
export const ROTULOS: Record<ChaveFato, string> = {
  curso: 'Curso', unidade: 'Unidade', campus: 'Campus', ingresso: 'Ingresso', vinculo: 'Vínculo', observacoes: 'Observações',
};

const texto = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');

/** A row (or null: no row yet) as `{ativa, fatos}`. */
export function paraMemoria(linha: unknown): Memoria {
  const l = (linha ?? {}) as { ativa?: unknown; fatos?: unknown };
  const fatos = l.fatos && typeof l.fatos === 'object' && !Array.isArray(l.fatos) ? (l.fatos as Fatos) : {};
  return { ativa: l.ativa !== false, fatos };
}

/** The facts in display order (fields, then each note); blank or malformed values are skipped. */
export function itensDaMemoria(fatos: Fatos): ItemMemoria[] {
  return (Object.keys(ROTULOS) as ChaveFato[]).flatMap((chave) => {
    const bruto = fatos[chave];
    const valores = chave === 'observacoes' ? (Array.isArray(bruto) ? bruto : []) : [bruto];
    return valores.flatMap((v, i) => {
      const valor = texto(v);
      return valor ? [{ chave, rotulo: ROTULOS[chave], valor, ...(chave === 'observacoes' ? { indice: i } : {}) }] : [];
    });
  });
}

/** The next `fatos` without one field, or without one note (`indice`); an emptied list drops the key. */
export function semFato(fatos: Fatos, { chave, indice }: Pick<ItemMemoria, 'chave' | 'indice'>): Fatos {
  const { [chave]: valor, ...resto } = fatos;
  if (chave !== 'observacoes' || indice === undefined || !Array.isArray(valor)) return resto;
  const sobram = valor.filter((_, i) => i !== indice);
  return sobram.length ? { ...resto, observacoes: sobram } : resto;
}

/** PostgREST's answer while the table does not exist yet. */
export const tabelaAusente = (error: { code?: string } | null, status?: number) =>
  !!error && (error.code === 'PGRST205' || error.code === '42P01' || status === 404);

/** The user's memory, or null when unavailable (table not migrated yet, or the read failed). Never throws. */
export async function lerMemoria(userId: string): Promise<Memoria | null> {
  try {
    const { data, error, status } = await supabase.from(TABELA).select('ativa,fatos').eq('user_id', userId).maybeSingle();
    if (error && !tabelaAusente(error, status)) console.error('[memoria] ler falhou:', error);
    return error ? null : paraMemoria(data);
  } catch (err) {
    console.error('[memoria] ler falhou:', err);
    return null;
  }
}

export async function definirMemoriaAtiva(userId: string, ativa: boolean): Promise<boolean> {
  const { error } = await supabase.from(TABELA).upsert({ user_id: userId, ativa }, { onConflict: 'user_id' });
  if (error) console.error('[memoria] alternar falhou:', error);
  return !error;
}

async function gravarFatos(userId: string, fatos: Fatos, operacao: string): Promise<boolean> {
  const { error } = await supabase.from(TABELA).update({ fatos, atualizada_em: new Date().toISOString() }).eq('user_id', userId);
  if (error) console.error(`[memoria] ${operacao} falhou:`, error);
  return !error;
}

/** Saves `fatos` without one fact; the saved object, or null on failure. */
export async function removerFato(userId: string, fatos: Fatos, item: Pick<ItemMemoria, 'chave' | 'indice'>): Promise<Fatos | null> {
  const proximos = semFato(fatos, item);
  return (await gravarFatos(userId, proximos, 'remover')) ? proximos : null;
}

/** Clears every fact (`ativa` is kept). */
export const apagarMemoria = (userId: string) => gravarFatos(userId, {}, 'apagar');
