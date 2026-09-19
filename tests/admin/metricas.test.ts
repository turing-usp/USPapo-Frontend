/**
 * app/(admin)/metricas tests: the /api/analytics/resumo fetch contract
 * (admin header per the worker decision), the KPI math, the "N bars for N
 * days" chart shaping, the 6-slot palette rule (stable alphabetical order,
 * 7th source → "Outros") and the pt-BR formatters.
 *
 * No network: global fetch is mocked, every byte is scripted. The fixture
 * (./fixture.ts) mirrors the backend metricas.resumo() field names.
 */
import {
  DIAS_POR_JANELA,
  NOME_OUTROS,
  ResumoApiError,
  adminKey,
  barrasDePerguntas,
  carregarResumo,
  coresDeFontes,
  formataMs,
  formataNumero,
  formataPorcentagem,
  kpisDaJanela,
  rotuloDia,
  type FonteCitada,
} from '../../app/(admin)/metricas';
import { DADOS, DADOS_VAZIOS, NEUTRO_LUZ, PALETA_LUZ, RESUMO_RESPOSTA, SERIE } from './fixture';

declare const process: { env: Record<string, string | undefined> };

// ─────────────────────────────────────────────
// Fake fetch (same recipe as tests/lib/api.test.ts)
// ─────────────────────────────────────────────

function respostaJSON(status: number, corpo: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corpo,
  } as unknown as Response;
}

function respostaSemJSON(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'text/html' }),
    json: async () => {
      throw new Error('corpo HTML, não JSON');
    },
  } as unknown as Response;
}

function instalarFetch(): jest.Mock<Promise<Response>, [string, RequestInit?]> {
  const fetchMock = jest.fn<Promise<Response>, [string, RequestInit?]>();
  (globalThis as unknown as { fetch: typeof fetch }).fetch =
    fetchMock as unknown as typeof fetch;
  return fetchMock;
}

// ─────────────────────────────────────────────
// carregarResumo (the admin-header contract)
// ─────────────────────────────────────────────

describe('carregarResumo', () => {
  const chaveAnterior = process.env.EXPO_PUBLIC_ADMIN_API_KEY;

  beforeEach(() => {
    delete process.env.EXPO_PUBLIC_BACKEND_URL;
    process.env.EXPO_PUBLIC_ADMIN_API_KEY = 'chave-admin-teste';
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_ADMIN_API_KEY;
    if (chaveAnterior === undefined) delete process.env.EXPO_PUBLIC_BACKEND_URL;
  });

  it('GETs {backendUrl()}/api/analytics/resumo sending X-Admin-Key from EXPO_PUBLIC_ADMIN_API_KEY', async () => {
    const fetchMock = instalarFetch();
    fetchMock.mockResolvedValue(respostaJSON(200, RESUMO_RESPOSTA));

    const dados = await carregarResumo();

    expect(dados).toBe(DADOS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8000/api/analytics/resumo');
    expect(init?.headers).toEqual({ 'X-Admin-Key': 'chave-admin-teste' });
  });

  it('omits the admin header when EXPO_PUBLIC_ADMIN_API_KEY is unset (the endpoint answers 403)', async () => {
    delete process.env.EXPO_PUBLIC_ADMIN_API_KEY;
    const fetchMock = instalarFetch();
    fetchMock.mockResolvedValue(respostaJSON(200, RESUMO_RESPOSTA));

    await carregarResumo();
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({});
  });

  it('honors EXPO_PUBLIC_BACKEND_URL (the web goes through the same-origin proxy)', async () => {
    process.env.EXPO_PUBLIC_BACKEND_URL = 'https://uspapo.example.com/';
    const fetchMock = instalarFetch();
    fetchMock.mockResolvedValue(respostaJSON(200, RESUMO_RESPOSTA));

    await carregarResumo();
    expect(fetchMock.mock.calls[0][0]).toBe('https://uspapo.example.com/api/analytics/resumo');
  });

  it('throws ResumoApiError with the backend 403 body message', async () => {
    const fetchMock = instalarFetch();
    fetchMock.mockResolvedValue(
      respostaJSON(403, { erro: 'Acesso não autorizado ao painel de analytics.' }),
    );

    const erro = await carregarResumo().catch((e) => e);
    expect(erro).toBeInstanceOf(ResumoApiError);
    expect((erro as ResumoApiError).status).toBe(403);
    expect((erro as Error).message).toBe('Acesso não autorizado ao painel de analytics.');
  });

  it('falls back to the generic pt-BR message when the error body is not JSON (503)', async () => {
    const fetchMock = instalarFetch();
    fetchMock.mockResolvedValue(respostaSemJSON(503));

    const erro = await carregarResumo().catch((e) => e);
    expect((erro as ResumoApiError).status).toBe(503);
    expect((erro as Error).message).toBe('Não consegui carregar as métricas.');
  });

  it('treats a 200 with a wrong shape as a contract error, never as empty data', async () => {
    const fetchMock = instalarFetch();
    fetchMock.mockResolvedValue(respostaJSON(200, { ok: true }));

    const erro = await carregarResumo().catch((e) => e);
    expect(erro).toBeInstanceOf(ResumoApiError);
  });

  it('propagates network failures as-is', async () => {
    const fetchMock = instalarFetch();
    const falha = new TypeError('Failed to fetch');
    fetchMock.mockRejectedValue(falha);

    await expect(carregarResumo()).rejects.toBe(falha);
  });

  it('adminKey() trims and treats blank values as unset', () => {
    process.env.EXPO_PUBLIC_ADMIN_API_KEY = '  chave  ';
    expect(adminKey()).toBe('chave');
    process.env.EXPO_PUBLIC_ADMIN_API_KEY = '   ';
    expect(adminKey()).toBe('');
    delete process.env.EXPO_PUBLIC_ADMIN_API_KEY;
    expect(adminKey()).toBe('');
  });
});

// ─────────────────────────────────────────────
// kpisDaJanela (the six numeric KPIs)
// ─────────────────────────────────────────────

describe('kpisDaJanela', () => {
  it('computes the 7d window over the fixture (hand-checked)', () => {
    const kpis = kpisDaJanela(DADOS, '7d');
    // perguntas/dia: (3+2+1+4+3+2+1)/7 = 16/7 (same expression → same double)
    expect(kpis.perguntasPorDia).toBe(16 / 7);
    // tempo médio: 12852/16 = 803.25 ms (weighted by the day's questions)
    expect(kpis.tempoMedioMs).toBe(12852 / 16);
    // taxa de sucesso: 1 − 3/150 = 0.98 (30-day performance)
    expect(kpis.taxaSucesso).toBe(1 - 3 / 150);
    expect(kpis.erros).toBe(3);
    // likes: even days 6,4,2,0 → 4; dislikes: day 3 → 2
    expect(kpis.likes).toBe(4);
    expect(kpis.dislikes).toBe(2);
  });

  it('computes the 24h window as today only', () => {
    const kpis = kpisDaJanela(DADOS, '24h');
    expect(kpis.perguntasPorDia).toBe(1);
    expect(kpis.tempoMedioMs).toBe(800);
    expect(kpis.likes).toBe(1);
    expect(kpis.dislikes).toBe(0);
    // Performance KPIs are always the backend's 30-day figures.
    expect(kpis.erros).toBe(3);
    expect(kpis.taxaSucesso).toBe(1 - 3 / 150);
  });

  it('computes the 30d window over the whole series', () => {
    const kpis = kpisDaJanela(DADOS, '30d');
    // 30 days (d = 29..0): 7 full (1,2,3,4) blocks = 70, plus d=28 → 1 and
    // d=29 → 2 → sum 73
    expect(kpis.perguntasPorDia).toBe(73 / 30);
    // likes: even d in 0..29 → 15
    expect(kpis.likes).toBe(15);
    // dislikes: d=3 only → 2
    expect(kpis.dislikes).toBe(2);
  });

  it('renders zeros (never NaN) for the empty panel', () => {
    const kpis = kpisDaJanela(DADOS_VAZIOS, '7d');
    expect(kpis).toEqual({
      perguntasPorDia: 0,
      tempoMedioMs: 0,
      taxaSucesso: 0,
      erros: 0,
      likes: 0,
      dislikes: 0,
    });
    for (const valor of [
      kpis.perguntasPorDia,
      kpis.tempoMedioMs,
      kpis.taxaSucesso,
      kpis.erros,
      kpis.likes,
      kpis.dislikes,
    ]) {
      expect(Number.isNaN(valor)).toBe(false);
    }
  });

  it('tolerates a short series (fewer points than the window)', () => {
    const dados = { ...DADOS, serie_temporal: SERIE.slice(-3) };
    const kpis = kpisDaJanela(dados, '7d');
    // last 3 days d=2..0: perguntas [3,2,1] → mean 2
    expect(kpis.perguntasPorDia).toBe(2);
  });
});

// ─────────────────────────────────────────────
// barrasDePerguntas (N bars for N days)
// ─────────────────────────────────────────────

describe('barrasDePerguntas', () => {
  it('renders N bars for N days of the selected window', () => {
    expect(barrasDePerguntas(DADOS, '24h')).toHaveLength(1);
    expect(barrasDePerguntas(DADOS, '7d')).toHaveLength(7);
    expect(barrasDePerguntas(DADOS, '30d')).toHaveLength(30);
    expect(DIAS_POR_JANELA).toEqual({ '24h': 1, '7d': 7, '30d': 30 });
  });

  it('keeps the series order and the dd/MM labels', () => {
    const barras = barrasDePerguntas(DADOS, '7d');
    expect(barras.map((b) => b.data)).toEqual(SERIE.slice(-7).map((p) => p.data));
    // rotuloDia: 2026-09-13 → '13/09'
    expect(rotuloDia('2026-09-13')).toBe('13/09');
    expect(barras[0].rotulo).toBe(rotuloDia(SERIE[23].data)); // last 7 = SERIE[23..29]
  });

  it('clamps to the available points and never goes negative', () => {
    const dados = { ...DADOS, serie_temporal: SERIE.slice(-3) };
    expect(barrasDePerguntas(dados, '7d')).toHaveLength(3);
    const vazias = barrasDePerguntas(DADOS_VAZIOS, '7d');
    expect(vazias).toEqual([]);
  });
});

// ─────────────────────────────────────────────
// coresDeFontes (the 6-slot palette rule)
// ─────────────────────────────────────────────

describe('coresDeFontes', () => {
  const seis: FonteCitada[] = [
    { fonte: 'jupiter.usp.br', contagem: 12 },
    { fonte: 'www.usp.br', contagem: 9 },
    { fonte: 'bandejao.com', contagem: 7 },
    { fonte: 'usp.br', contagem: 6 },
    { fonte: 'reitoria.usp.br', contagem: 4 },
    { fonte: 'portal.usp.br', contagem: 3 },
  ];

  it('assigns palette slots by the STABLE (alphabetical) order, never by rank', () => {
    const linhas = coresDeFontes(seis, PALETA_LUZ, NEUTRO_LUZ);
    // Alphabetical order of the six names: bandejao.com, jupiter.usp.br,
    // portal.usp.br, reitoria.usp.br, usp.br, www.usp.br → slot 0..5.
    const corPorNome = new Map(linhas.map((l) => [l.nome, l.cor]));
    expect(corPorNome.get('bandejao.com')).toBe(PALETA_LUZ[0]);
    expect(corPorNome.get('jupiter.usp.br')).toBe(PALETA_LUZ[1]);
    expect(corPorNome.get('portal.usp.br')).toBe(PALETA_LUZ[2]);
    expect(corPorNome.get('reitoria.usp.br')).toBe(PALETA_LUZ[3]);
    expect(corPorNome.get('usp.br')).toBe(PALETA_LUZ[4]);
    expect(corPorNome.get('www.usp.br')).toBe(PALETA_LUZ[5]);
    // Display keeps the count ranking (the input order), no "Outros".
    expect(linhas.map((l) => l.nome)).toEqual(
      ['jupiter.usp.br', 'www.usp.br', 'bandejao.com', 'usp.br', 'reitoria.usp.br', 'portal.usp.br'],
    );
    expect(linhas.every((l) => !l.eOutros)).toBe(true);
  });

  it('the 7th source (alphabetically) becomes ONE "Outros" row in the neutral color, appended last', () => {
    const sete: FonteCitada[] = [
      { fonte: 'jupiter.usp.br', contagem: 12 },
      { fonte: 'www.usp.br', contagem: 9 },
      { fonte: 'bandejao.com', contagem: 7 },
      { fonte: 'usp.br', contagem: 6 },
      { fonte: 'reitoria.usp.br', contagem: 4 },
      { fonte: 'portal.usp.br', contagem: 3 },
      { fonte: 'ciencia.usp.br', contagem: 2 },
    ];
    const linhas = coresDeFontes(sete, PALETA_LUZ, NEUTRO_LUZ);

    // Alphabetical slot order: bandejao(0) ciencia(1) jupiter(2) portal(3)
    // reitoria(4) usp.br(5) → www.usp.br is 7th → "Outros".
    const corPorNome = new Map(linhas.filter((l) => !l.eOutros).map((l) => [l.nome, l.cor]));
    expect(corPorNome.get('jupiter.usp.br')).toBe(PALETA_LUZ[2]);
    expect(corPorNome.get('ciencia.usp.br')).toBe(PALETA_LUZ[1]);

    const outros = linhas[linhas.length - 1];
    expect(outros.nome).toBe(NOME_OUTROS);
    expect(outros.eOutros).toBe(true);
    expect(outros.cor).toBe(NEUTRO_LUZ);
    expect(outros.contagem).toBe(9); // the collapsed www.usp.br count
    expect(linhas).toHaveLength(7); // 6 slotted + 1 "Outros"
  });

  it('keeps the same name→color mapping when the ranking changes (entity-stable)', () => {
    const hoje = coresDeFontes(seis, PALETA_LUZ, NEUTRO_LUZ);
    // Tomorrow the ranking flips completely: the colors must not move.
    const amanha = coresDeFontes(
      [...seis].sort((a, b) => b.contagem - a.contagem).reverse(),
      PALETA_LUZ,
      NEUTRO_LUZ,
    );
    const corHoje = new Map(hoje.map((l) => [l.nome, l.cor]));
    const corAmanha = new Map(amanha.map((l) => [l.nome, l.cor]));
    for (const [nome, cor] of corHoje) expect(corAmanha.get(nome)).toBe(cor);
  });

  it('aggregates the excess count when more than six sources share "Outros"', () => {
    const oito: FonteCitada[] = [
      ...seis,
      { fonte: 'ciencia.usp.br', contagem: 2 },
      { fonte: 'leis.usp.br', contagem: 1 },
    ];
    const linhas = coresDeFontes(oito, PALETA_LUZ, NEUTRO_LUZ);
    // Alphabetical slot order: bandejao(0) ciencia(1) jupiter(2) leis(3)
    // portal(4) reitoria(5) → usp.br and www.usp.br are 7th/8th → "Outros".
    const outros = linhas[linhas.length - 1];
    expect(outros.nome).toBe(NOME_OUTROS);
    expect(outros.contagem).toBe(15); // 6 (usp.br) + 9 (www.usp.br)
    expect(linhas).toHaveLength(7);
  });

  it('returns nothing (and no "Outros") for an empty list', () => {
    expect(coresDeFontes([], PALETA_LUZ, NEUTRO_LUZ)).toEqual([]);
  });
});

// ─────────────────────────────────────────────
// pt-BR formatters
// ─────────────────────────────────────────────

describe('pt-BR formatters', () => {
  it('formataNumero: thousands ".", decimal ",", no trailing ,0', () => {
    expect(formataNumero(0)).toBe('0');
    expect(formataNumero(16 / 7, 1)).toBe('2,3');
    expect(formataNumero(1)).toBe('1');
    expect(formataNumero(1.0, 1)).toBe('1');
    expect(formataNumero(1234)).toBe('1.234');
    expect(formataNumero(1234567)).toBe('1.234.567');
    expect(formataNumero(2.34, 1)).toBe('2,3');
  });

  it('formataNumero renders non-finite input as "0" (empty state, never NaN)', () => {
    expect(formataNumero(Number.NaN)).toBe('0');
    expect(formataNumero(Number.POSITIVE_INFINITY)).toBe('0');
    expect(formataNumero(Number.NaN, 1)).toBe('0');
  });

  it('formataPorcentagem: 0..1 → "98%" (empty → "0%")', () => {
    expect(formataPorcentagem(0.98)).toBe('98%');
    expect(formataPorcentagem(0)).toBe('0%');
    expect(formataPorcentagem(Number.NaN)).toBe('0%');
  });

  it('formataMs: "803 ms" / "1.234 ms" (empty → "0 ms")', () => {
    expect(formataMs(803.25)).toBe('803 ms');
    expect(formataMs(1234.6)).toBe('1.235 ms');
    expect(formataMs(0)).toBe('0 ms');
    expect(formataMs(Number.NaN)).toBe('0 ms');
  });
});
