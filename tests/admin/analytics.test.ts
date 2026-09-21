/**
 * app/(admin)/analytics.tsx screen tests, against a FAKE fetch with the
 * exact backend JSON shape (fixture: the metricas.resumo() output).
 *
 * Covers: the KPI cards render the backend numbers (field names mirrored),
 * the admin header on the wire (X-Admin-Key per the worker contract), the
 * bar chart (N bars for N days), the fontes palette in the UI (7th source
 * → "Outros" in the neutral color), the window selector, the loading
 * skeleton, the empty panel (zeros, never NaN) and the 403 → retry path.
 *
 * The theme module is mocked with the light tokens (the palette hexes are
 * the real theme values, copied here so the mock stays self-contained).
 */
import React from 'react';
import { fireEvent, render, within } from '@testing-library/react-native';

import PainelMetricas from '../../app/(admin)/analytics';
import { DADOS_VAZIOS, NEUTRO_LUZ, PALETA_LUZ, RESUMO_RESPOSTA } from './fixture';

declare const process: { env: Record<string, string | undefined> };

// The light tokens (theme/index.tsx), so the palette assertions use the
// real hexes.
const mockTEMA = {
  scheme: 'light',
  colors: {
    brand: '#f1863d',
    brandStrong: '#e07125',
    brandForeground: '#ffffff',
    canvas: '#dde4f6',
    surface: '#ccd6ef',
    surfaceRaised: '#ffffff',
    foreground: '#0b1030',
    mutedForeground: NEUTRO_LUZ,
    faintForeground: '#8790ad',
    line: '#0b1030',
    tint: '#0b1030',
    scrim: '#0b1030',
    danger: '#c53434',
    chart: PALETA_LUZ,
  },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, '2xl': 24, '3xl': 32 },
  radius: { sm: 8, md: 12, lg: 16, xl: 24, full: 9999 },
  typography: {
    xs: { fontSize: 11, lineHeight: 15 },
    sm: { fontSize: 14, lineHeight: 20 },
    base: { fontSize: 16, lineHeight: 24 },
    lg: { fontSize: 18, lineHeight: 26 },
    xl: { fontSize: 20, lineHeight: 28 },
    '2xl': { fontSize: 24, lineHeight: 32 },
    '3xl': { fontSize: 30, lineHeight: 38 },
  },
  glass: {
    surface: { backgroundColor: 'rgba(255,255,255,0.55)' },
    raised: { backgroundColor: 'rgba(255,255,255,0.72)' },
    brand: { backgroundColor: 'rgba(255,255,255,0.40)' },
    hairline: { borderColor: 'rgba(255,255,255,0.65)', borderWidth: 1 },
    shadow: { shadowColor: 'rgb(11,16,48)' },
  },
};

jest.mock('../../theme/index', () => ({
  useTheme: () => mockTEMA,
  // The screens also import the `fonts` map by name. A mock that only
  // exports `useTheme` leaves it undefined, and the screen crashes on
  // `fonts.displayBold` before it renders a single line — which is what
  // this suite was failing on, not anything about the panel.
  fonts: {
    body: 'Roboto',
    bodyBold: 'Roboto-Bold',
    display: 'Geom',
    displayBold: 'Geom-Bold',
    accent: 'Orbitron',
    accentBold: 'Orbitron-Bold',
  },
}));

// ─────────────────────────────────────────────
// Fake fetch
// ─────────────────────────────────────────────

function respostaJSON(status: number, corpo: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corpo,
  } as unknown as Response;
}

function instalarFetch(): jest.Mock<Promise<Response>, [string, RequestInit?]> {
  const fetchMock = jest.fn<Promise<Response>, [string, RequestInit?]>();
  (globalThis as unknown as { fetch: typeof fetch }).fetch =
    fetchMock as unknown as typeof fetch;
  return fetchMock;
}

/** Flattens an RN style (object | array) and reads backgroundColor. */
function corDe(instance: { props: { style?: unknown } }): string | undefined {
  const style = instance.props.style;
  const partes: unknown[] = Array.isArray(style) ? style : [style];
  for (const parte of partes) {
    if (parte && typeof parte === 'object' && 'backgroundColor' in parte) {
      return String((parte as { backgroundColor: unknown }).backgroundColor);
    }
  }
  return undefined;
}

// ─────────────────────────────────────────────
// Happy path: KPI cards from the fake fetch
// ─────────────────────────────────────────────

describe('PainelMetricas (happy path)', () => {
  beforeEach(() => {
    delete process.env.EXPO_PUBLIC_BACKEND_URL;
    process.env.EXPO_PUBLIC_ADMIN_API_KEY = 'chave-admin-teste';
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_ADMIN_API_KEY;
  });

  it('renders the seven KPIs from the exact backend JSON shape (7d window)', async () => {
    const fetchMock = instalarFetch();
    fetchMock.mockResolvedValue(respostaJSON(200, RESUMO_RESPOSTA));

    const r = await render(React.createElement(PainelMetricas));
    await r.findByText('Perguntas/dia'); // the panel is ready

    // The six numeric cards, hand-checked against the fixture.
    within(r.getByTestId('kpi-perguntas-dia')).getByText('2,3'); // 16/7
    within(r.getByTestId('kpi-tempo-medio')).getByText('803 ms'); // 12852/16
    within(r.getByTestId('kpi-taxa-sucesso')).getByText('98%'); // 1 − 3/150
    within(r.getByTestId('kpi-erros')).getByText('3');
    within(r.getByTestId('kpi-likes')).getByText('4');
    within(r.getByTestId('kpi-dislikes')).getByText('2');
    // The window captions.
    within(r.getByTestId('kpi-perguntas-dia')).getByText('últimos 7 dias');
    within(r.getByTestId('kpi-taxa-sucesso')).getByText('últimos 30 dias');

    // The 7th KPI: the fontes list (6 slotted + 1 "Outros").
    r.getByText('Fontes mais citadas');
    expect(r.getAllByTestId('fonte-linha')).toHaveLength(6);
    expect(r.queryAllByTestId('fonte-outros')).toHaveLength(1);

    // The bar chart: 7 bars for the 7-day window.
    expect(r.getAllByTestId('barra-dia')).toHaveLength(7);

    // The wire contract: one GET with the admin header.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8000/api/analytics/resumo');
    expect(init?.headers).toEqual({ 'X-Admin-Key': 'chave-admin-teste' });
  });

  it('colors the fontes with the stable palette slots (jupiter = slot 2; "Outros" neutral)', async () => {
    const fetchMock = instalarFetch();
    fetchMock.mockResolvedValue(respostaJSON(200, RESUMO_RESPOSTA));

    const r = await render(React.createElement(PainelMetricas));
    await r.findByText('Fontes mais citadas');

    // Display order = the count ranking: jupiter(12), bandejao(7),
    // usp.br(6), reitoria(4), portal(3), ciencia(2) — then "Outros".
    // Alphabetical slot order: bandejao(0), ciencia(1), jupiter(2),
    // portal(3), reitoria(4), usp.br(5) → jupiter takes PALETA[2].
    const pontos = r.getAllByTestId('fonte-ponto');
    expect(pontos).toHaveLength(7); // 6 slotted + "Outros"
    expect(corDe(pontos[0])).toBe(PALETA_LUZ[2]); // jupiter.usp.br
    expect(corDe(pontos[1])).toBe(PALETA_LUZ[0]); // bandejao.com
    expect(corDe(pontos[5])).toBe(PALETA_LUZ[1]); // ciencia.usp.br
    // The 7th (alphabetical) source is collapsed into "Outros", neutral.
    expect(corDe(pontos[6])).toBe(NEUTRO_LUZ);
    within(r.getByTestId('fonte-outros')).getByText('Outros');
    within(r.getByTestId('fonte-outros')).getByText('9'); // the collapsed count
  });

  it('the window selector re-slices the KPIs and the chart (24h → 1 bar)', async () => {
    const fetchMock = instalarFetch();
    fetchMock.mockResolvedValue(respostaJSON(200, RESUMO_RESPOSTA));

    const r = await render(React.createElement(PainelMetricas));
    await r.findByText('Perguntas/dia');

    await fireEvent.press(r.getByTestId('janela-24h'));

    // Today only: perguntas [1], latency 800, likes 1, dislikes 0.
    await within(r.getByTestId('kpi-perguntas-dia')).findByText('1');
    within(r.getByTestId('kpi-perguntas-dia')).getByText('últimas 24h');
    within(r.getByTestId('kpi-tempo-medio')).getByText('800 ms');
    within(r.getByTestId('kpi-likes')).getByText('1');
    within(r.getByTestId('kpi-dislikes')).getByText('0');
    expect(r.getAllByTestId('barra-dia')).toHaveLength(1);
    // Still ONE fetch: the window is a client-side slice.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────
// Loading / empty / error
// ─────────────────────────────────────────────

describe('PainelMetricas (states)', () => {
  beforeEach(() => {
    delete process.env.EXPO_PUBLIC_BACKEND_URL;
    process.env.EXPO_PUBLIC_ADMIN_API_KEY = 'chave-admin-teste';
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_ADMIN_API_KEY;
  });

  it('shows the skeleton while the fetch is in flight', async () => {
    const fetchMock = instalarFetch();
    fetchMock.mockReturnValueOnce(new Promise<Response>(() => {})); // never settles

    const r = await render(React.createElement(PainelMetricas));
    expect(r.getByText('Carregando métricas…')).toBeTruthy();
    expect(r.getAllByTestId('esqueleto')).toHaveLength(6);
    expect(r.queryByTestId('kpi-perguntas-dia')).toBeNull();
  });

  it('renders zeros (never NaN) for the empty panel', async () => {
    const fetchMock = instalarFetch();
    fetchMock.mockResolvedValue(respostaJSON(200, { ok: true, data: DADOS_VAZIOS }));

    const r = await render(React.createElement(PainelMetricas));
    await r.findByText('Perguntas/dia');

    within(r.getByTestId('kpi-perguntas-dia')).getByText('0');
    within(r.getByTestId('kpi-tempo-medio')).getByText('0 ms');
    within(r.getByTestId('kpi-taxa-sucesso')).getByText('0%');
    within(r.getByTestId('kpi-erros')).getByText('0');
    within(r.getByTestId('kpi-likes')).getByText('0');
    within(r.getByTestId('kpi-dislikes')).getByText('0');
    r.getByText('Nenhuma fonte citada no período.');
    const arvore = JSON.stringify(r.toJSON());
    expect(arvore).not.toContain('NaN');
    expect(arvore).not.toContain('undefined');
  });

  it('shows the retry state on 403 and recovers when the retry succeeds', async () => {
    const fetchMock = instalarFetch();
    // First call → 403 (the backend's exact body); the retry → the panel.
    let chamadas = 0;
    fetchMock.mockImplementation(async () => {
      chamadas += 1;
      return chamadas === 1
        ? respostaJSON(403, { erro: 'Acesso não autorizado ao painel de analytics.' })
        : respostaJSON(200, RESUMO_RESPOSTA);
    });

    const r = await render(React.createElement(PainelMetricas));

    // The documented pt-BR error + the retry button; no panel yet.
    await r.findByText('Não consegui carregar as métricas');
    expect(r.queryByTestId('kpi-perguntas-dia')).toBeNull();

    await fireEvent.press(r.getByTestId('botao-tentar-novamente'));

    // The second call gets the panel.
    await r.findByText('2,3');
    within(r.getByTestId('kpi-taxa-sucesso')).getByText('98%');
    expect(chamadas).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
