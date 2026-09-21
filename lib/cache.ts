/**
 * Offline conversation store (P9 — light offline).
 *
 * Persists the last-known state of the user's `conversas` rows (one row per
 * conversation — the same shape as lib/conversations) AND the offline
 * question queue (lib/net) in ONE local backend, so:
 *
 * - the history screen renders with no network (resposta-null rows render
 *   as pending);
 * - the queue survives an app restart;
 * - "Continuar de onde parou" (home) shows the last cached conversations.
 *
 * Backend: expo-sqlite (an installed project dependency — no deviation).
 * Tables, in the 'uspapo' database:
 *
 *   conversas_cache(user_id, id, pergunta, resposta, criada_em,
 *                   atualizada_em, favorita)          PK (user_id, id)
 *   fila_offline(id, conversation_id, question, enqueued_at, ordem)
 *
 * Seam: the public API below talks to a `BancoOffline` implementation.
 * The default is the SQLite one; `configurarBanco` swaps in a fake in the
 * jest tests (and lets a future AsyncStorage/other backend slot in with a
 * one-file change — the rest of the app never sees the driver).
 *
 * Everything is LAZY: nothing touches the native SQLite module until the
 * first real call, so importing this file (e.g. under jest, where
 * expo-sqlite is auto-mocked) is side-effect free.
 *
 * NO background data by design (the "light offline" scope): this is the
 * only offline storage — the RAG index is never cached, nothing is
 * pre-fetched.
 */
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import type { Conversa, Mensagem } from './conversations';
import type { QueueItem } from './net';

/** A cached conversation row (the Conversa shape + the RLS owner). */
export type ConversaCacheada = Conversa & { user_id: string };

/**
 * The storage seam. The SQLite implementation is the default; tests
 * configure an in-memory fake via `configurarBanco` ("fake storage").
 */
export interface BancoOffline {
  salvarConversa(conversa: ConversaCacheada): Promise<void>;
  /** All cached rows of the user, newest `atualizada_em` first. */
  historico(userId: string): Promise<Conversa[]>;
  ultimas(userId: string, quantidade: number): Promise<Conversa[]>;
  conversaPorId(userId: string, id: string): Promise<Conversa | null>;
  /** Row count (all users, or just `userId` when given). */
  tamanho(userId?: string): Promise<number>;
  /** Drops the whole conversation cache (the queue has its own clear). */
  limpar(): Promise<void>;
  /** Queue ops — the queue is persisted on THIS backend (P9). */
  filaListar(): Promise<QueueItem[]>;
  filaInserir(item: QueueItem, naFrente: boolean): Promise<void>;
  filaRemover(id: string): Promise<void>;
  filaLimpar(): Promise<void>;
}

// ─────────────────────────────────────────────
// Public API (seam over the active banco)
// ─────────────────────────────────────────────

let bancoCustomizado: BancoOffline | null = null;

/** Swaps the storage backend (tests; a future driver swap). */
export function configurarBanco(b: BancoOffline): void {
  bancoCustomizado = b;
}

function bancoAtivo(): BancoOffline {
  return bancoCustomizado ?? bancoSqlite;
}

/**
 * Upserts one conversation row in the cache (the write-through mirror of
 * lib/conversations: the app calls it after the server write succeeds —
 * or right after a network failure, with `resposta: null` for the pending
 * row). Last write wins per (user_id, id).
 */
export async function salvarConversa(conversa: ConversaCacheada): Promise<void> {
  await bancoAtivo().salvarConversa(conversa);
}

/** Bulk write-through (the history screen keeps the window fresh). */
export async function salvarConversas(userId: string, conversas: Conversa[]): Promise<void> {
  const b = bancoAtivo();
  for (const c of conversas) {
    await b.salvarConversa({ ...c, user_id: userId });
  }
}

/** The cached history of the user (the offline fallback of lerHistorico). */
export async function carregarHistoricoOffline(userId: string): Promise<Conversa[]> {
  return bancoAtivo().historico(userId);
}

/** The last `quantidade` cached conversations (newest first; default 3). */
export async function ultimasConversasOffline(
  userId: string,
  quantidade: number = 3,
): Promise<Conversa[]> {
  return bancoAtivo().ultimas(userId, quantidade);
}

/** One cached row by conversation id (null when not cached). */
export async function conversaPorIdOffline(
  userId: string,
  id: string,
): Promise<Conversa | null> {
  return bancoAtivo().conversaPorId(userId, id);
}

/** Drops the whole conversation cache (all users). */
export async function limpar(): Promise<void> {
  await bancoAtivo().limpar();
}

/** Total cached rows (all users). */
export async function tamanho(): Promise<number> {
  return bancoAtivo().tamanho();
}

/**
 * Merges the server rows (lib/conversations.lerHistorico) with the cached
 * rows, one row per id:
 *
 * - the server wins when its `atualizada_em` is >= the cache's (the server
 *   is the source of truth when both agree or the server is newer);
 * - the cache wins ONLY when it is strictly newer (an offline completion
 *   that has not reached the server yet);
 * - ids present in only one side pass through untouched.
 *
 * The result is newest first (`atualizada_em` desc). `fundirHistorico([],
 * cache)` is the cache itself — the "Supabase down" case.
 */
export function fundirHistorico(daServidor: Conversa[], daCache: Conversa[]): Conversa[] {
  const porId = new Map<string, Conversa>();
  for (const c of daCache) porId.set(c.id, c);
  for (const s of daServidor) {
    const emCache = porId.get(s.id);
    if (!emCache || (s.atualizada_em ?? '') >= (emCache.atualizada_em ?? '')) {
      porId.set(s.id, s);
    }
  }
  return [...porId.values()].sort((a, b) =>
    (b.atualizada_em ?? '').localeCompare(a.atualizada_em ?? ''),
  );
}

/**
 * The queue storage part of the seam (lib/net delegates here, so the
 * queue is persisted on the SAME backend as the conversation cache).
 */
export const filaOffline = {
  listar(): Promise<QueueItem[]> {
    return bancoAtivo().filaListar();
  },
  inserir(item: QueueItem, naFrente: boolean): Promise<void> {
    return bancoAtivo().filaInserir(item, naFrente);
  },
  remover(id: string): Promise<void> {
    return bancoAtivo().filaRemover(id);
  },
  limpar(): Promise<void> {
    return bancoAtivo().filaLimpar();
  },
};

// ─────────────────────────────────────────────
// Default backend: expo-sqlite
// ─────────────────────────────────────────────

const NOME_BANCO = 'uspapo';
const SCRIPT_ESQUEMA = `
CREATE TABLE IF NOT EXISTS conversas_cache (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  titulo TEXT NOT NULL DEFAULT '',
  fontes TEXT NOT NULL DEFAULT '[]',
  mensagens TEXT NOT NULL DEFAULT '[]',
  pergunta TEXT NOT NULL,
  resposta TEXT,
  criada_em TEXT NOT NULL,
  atualizada_em TEXT NOT NULL,
  favorita INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, id)
);
CREATE TABLE IF NOT EXISTS fila_offline (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  question TEXT NOT NULL,
  enqueued_at INTEGER NOT NULL,
  ordem INTEGER NOT NULL,
  turno INTEGER NOT NULL DEFAULT 0
);
`;

let conexao: SQLiteDatabase | null = null;

/** Lazy open (idempotent schema): the first real call pays the cost. */
/**
 * Columns added after the table already shipped. `CREATE TABLE IF NOT EXISTS`
 * is a no-op on an existing install, so a plain schema bump would never reach
 * a phone that had already opened the app — these two are added separately
 * and the "duplicate column" error is the success case on later launches.
 */
const COLUNAS_NOVAS = [
  "ALTER TABLE conversas_cache ADD COLUMN titulo TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE conversas_cache ADD COLUMN fontes TEXT NOT NULL DEFAULT '[]'",
  // A conversation is a LIST of turns (lib/conversations): the cache keeps
  // them whole, as JSON, so reopening one offline shows every turn instead
  // of only the first.
  "ALTER TABLE conversas_cache ADD COLUMN mensagens TEXT NOT NULL DEFAULT '[]'",
  // Which turn of the conversation a queued question belongs to.
  'ALTER TABLE fila_offline ADD COLUMN turno INTEGER NOT NULL DEFAULT 0',
];

function sqlite(): SQLiteDatabase {
  if (conexao) return conexao;
  const db = openDatabaseSync(NOME_BANCO);
  db.execSync(SCRIPT_ESQUEMA);
  for (const migracao of COLUNAS_NOVAS) {
    try {
      db.execSync(migracao);
    } catch {
      // The column is already there: this is the steady state.
    }
  }
  conexao = db;
  return db;
}

type LinhaCache = {
  id: string;
  titulo: string;
  fontes: string;
  mensagens: string;
  pergunta: string;
  resposta: string | null;
  criada_em: string;
  atualizada_em: string;
  favorita: number;
};

/** `fontes` is stored as a JSON string; a corrupt value degrades to none. */
function lerFontes(bruto: string | null | undefined): string[] {
  if (!bruto) return [];
  try {
    const v = JSON.parse(bruto);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

/**
 * The turns, as stored. A row written before the `mensagens` column existed
 * (or by an older build) has none, and its single legacy question/answer
 * pair stands in for turn 0 — the conversation still opens, with what the
 * cache actually knows.
 */
function lerMensagens(bruto: string | null | undefined, l: LinhaCache): Mensagem[] {
  if (bruto) {
    try {
      const v = JSON.parse(bruto);
      if (Array.isArray(v) && v.length > 0) {
        return v.map((m, i) => ({
          ordem: Number((m as Mensagem).ordem ?? i),
          pergunta: String((m as Mensagem).pergunta ?? ''),
          resposta:
            (m as Mensagem).resposta === null || (m as Mensagem).resposta === undefined
              ? null
              : String((m as Mensagem).resposta),
          fontes: Array.isArray((m as Mensagem).fontes)
            ? (m as Mensagem).fontes.map(String)
            : [],
        }));
      }
    } catch {
      // Corrupt JSON: fall through to the legacy pair below.
    }
  }
  if (!l.pergunta) return [];
  return [
    {
      ordem: 0,
      pergunta: l.pergunta,
      resposta: l.resposta === null ? null : l.resposta,
      fontes: lerFontes(l.fontes),
    },
  ];
}

function linhaParaConversa(l: LinhaCache): Conversa {
  const mensagens = lerMensagens(l.mensagens, l);
  const ultima = mensagens[mensagens.length - 1];
  return {
    id: l.id,
    titulo: l.titulo ?? '',
    mensagens,
    fontes: ultima ? ultima.fontes : lerFontes(l.fontes),
    pergunta: mensagens[0]?.pergunta ?? l.pergunta,
    resposta: ultima ? ultima.resposta : l.resposta === null ? null : l.resposta,
    criada_em: l.criada_em,
    atualizada_em: l.atualizada_em,
    favorita: l.favorita === 1,
  };
}

const SELECT_CACHE =
  'SELECT id, titulo, fontes, mensagens, pergunta, resposta, criada_em, atualizada_em, favorita FROM conversas_cache';

const bancoSqlite: BancoOffline = {
  async salvarConversa(c) {
    sqlite().runSync(
      `INSERT INTO conversas_cache
         (user_id, id, titulo, fontes, mensagens, pergunta, resposta, criada_em, atualizada_em, favorita)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, id) DO UPDATE SET
         titulo = excluded.titulo,
         fontes = excluded.fontes,
         mensagens = excluded.mensagens,
         pergunta = excluded.pergunta,
         resposta = excluded.resposta,
         criada_em = excluded.criada_em,
         atualizada_em = excluded.atualizada_em,
         favorita = excluded.favorita`,
      [
        c.user_id,
        c.id,
        c.titulo ?? '',
        JSON.stringify(c.fontes ?? []),
        JSON.stringify(c.mensagens ?? []),
        c.pergunta,
        c.resposta,
        c.criada_em,
        c.atualizada_em,
        c.favorita ? 1 : 0,
      ],
    );
  },

  async historico(userId) {
    return sqlite()
      .getAllSync<LinhaCache>(
        `${SELECT_CACHE} WHERE user_id = ? ORDER BY atualizada_em DESC, criada_em DESC`,
        [userId],
      )
      .map(linhaParaConversa);
  },

  async ultimas(userId, quantidade) {
    return sqlite()
      .getAllSync<LinhaCache>(
        `${SELECT_CACHE} WHERE user_id = ? ORDER BY atualizada_em DESC, criada_em DESC LIMIT ?`,
        [userId, quantidade],
      )
      .map(linhaParaConversa);
  },

  async conversaPorId(userId, id) {
    const [l] = sqlite().getAllSync<LinhaCache>(
      `${SELECT_CACHE} WHERE user_id = ? AND id = ?`,
      [userId, id],
    );
    return l ? linhaParaConversa(l) : null;
  },

  async tamanho(userId) {
    const [r] = sqlite().getAllSync<{ n: number }>(
      userId !== undefined
        ? 'SELECT COUNT(*) AS n FROM conversas_cache WHERE user_id = ?'
        : 'SELECT COUNT(*) AS n FROM conversas_cache',
      userId !== undefined ? [userId] : [],
    );
    return r?.n ?? 0;
  },

  async limpar() {
    sqlite().execSync('DELETE FROM conversas_cache');
  },

  async filaListar() {
    return sqlite()
      .getAllSync<QueueItem>(
        `SELECT id, conversation_id AS conversationId, question,
                enqueued_at AS enqueuedAt, turno
         FROM fila_offline ORDER BY ordem ASC`,
        [],
      );
  },

  async filaInserir(item, naFrente) {
    const db = sqlite();
    const [r] = db.getAllSync<{ m: number }>(
      naFrente
        ? 'SELECT COALESCE(MIN(ordem), 1) - 1 AS m FROM fila_offline'
        : 'SELECT COALESCE(MAX(ordem), 0) + 1 AS m FROM fila_offline',
      [],
    );
    db.runSync(
      'INSERT INTO fila_offline (id, conversation_id, question, enqueued_at, ordem, turno) VALUES (?, ?, ?, ?, ?, ?)',
      [
        item.id,
        item.conversationId,
        item.question,
        item.enqueuedAt,
        r?.m ?? 0,
        item.turno ?? 0,
      ],
    );
  },

  async filaRemover(id) {
    sqlite().runSync('DELETE FROM fila_offline WHERE id = ?', [id]);
  },

  async filaLimpar() {
    sqlite().execSync('DELETE FROM fila_offline');
  },
};
