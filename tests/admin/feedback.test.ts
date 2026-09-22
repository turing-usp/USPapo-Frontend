/**
 * app/(admin)/feedback.tsx screen tests: the rows the screen renders, where
 * they come from, and the two states that are NOT rows (empty window, failed
 * read).
 *
 * The seam `carregarFeedback` (./feedbackApi.ts) reads
 * `GET /api/analytics/resumo` → `data.feedback.itens`; the table itself is
 * owner-only RLS, so the web can never query Supabase directly. It used to
 * resolve to a hardcoded empty list, and this suite used to assert exactly
 * that ("no network call at all") — which is why the screen could show "no
 * feedback" over a full table without a single test objecting.
 */
import React from 'react';
import { render } from '@testing-library/react-native';

import PainelFeedback, { LinhaFeedback } from '../../app/(admin)/feedback';
import { formataDataFeedback, rotuloNota } from '../../app/(admin)/feedbackApi';

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
    mutedForeground: '#55618a',
    faintForeground: '#8790ad',
    line: '#0b1030',
    tint: '#0b1030',
    scrim: '#0b1030',
    danger: '#c53434',
    chart: ['#eb6834', '#2a78d6', '#1baf7a', '#4a3aa7', '#eda100', '#e87ba4'],
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
// The screen
// ─────────────────────────────────────────────

/** A `/api/analytics/resumo` body carrying just the feedback block. */
function resumoCom(itens: unknown[]): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => ({
      ok: true,
      data: {
        dau: 0,
        mau: 0,
        usuarios: { dau: 0, mau: 0, razao_dau_mau: 0 },
        tokens: {
          hoje: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          acumulado_30d: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          por_provedor: {},
          por_modelo: {},
        },
        desempenho_provedores: {},
        top_usuarios: [],
        serie_temporal: [],
        feedback: {
          total: itens.length,
          likes: 0,
          dislikes: 0,
          respostas_avaliaveis: 0,
          taxa_satisfacao: 0,
          cobertura: 0,
          por_motivo: {},
          serie: [],
          itens,
        },
        fontes_citadas: [],
        temas_frequentes: [],
      },
    }),
  } as unknown as Response;
}

function instalarFetch(): jest.Mock<Promise<Response>, [string, RequestInit?]> {
  const fetchMock = jest.fn<Promise<Response>, [string, RequestInit?]>();
  (globalThis as unknown as { fetch: typeof fetch }).fetch =
    fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('PainelFeedback', () => {
  it('renders the rows the summary endpoint returned', async () => {
    const fetchMock = instalarFetch();
    fetchMock.mockResolvedValue(
      resumoCom([
        {
          id: '1',
          tipo: 'dislike',
          motivo: 'Resposta longa',
          comentario: null,
          created_at: '2026-09-15T09:15:00.000Z',
        },
        {
          id: '2',
          tipo: 'like',
          motivo: null,
          comentario: null,
          created_at: '2026-09-14T08:00:00.000Z',
        },
      ]),
    );

    const r = await render(React.createElement(PainelFeedback));

    await r.findByText('Resposta longa');
    expect(r.queryAllByTestId('linha-feedback')).toHaveLength(2);
    // The rows come from the backend, never from a direct Supabase read.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/analytics/resumo');
  });

  it('a like row with only a free-text comment shows the comment', async () => {
    const fetchMock = instalarFetch();
    fetchMock.mockResolvedValue(
      resumoCom([
        {
          id: '3',
          tipo: 'dislike',
          motivo: null,
          comentario: 'Citou uma sala que não existe',
          created_at: '2026-09-15T09:15:00.000Z',
        },
      ]),
    );

    const r = await render(React.createElement(PainelFeedback));
    await r.findByText('Citou uma sala que não existe');
  });

  it('an empty 30-day window is the empty state, not an error', async () => {
    const fetchMock = instalarFetch();
    fetchMock.mockResolvedValue(resumoCom([]));

    const r = await render(React.createElement(PainelFeedback));

    await r.findByText('Nenhum feedback nos últimos 30 dias');
    expect(r.queryAllByTestId('linha-feedback')).toHaveLength(0);
  });

  it('a failed read says so instead of pretending the list is empty', async () => {
    const fetchMock = instalarFetch();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ erro: 'Acesso não autorizado ao painel de analytics.' }),
    } as unknown as Response);

    const r = await render(React.createElement(PainelFeedback));

    await r.findByText('Não consegui carregar o feedback. Recarregue a página.');
    expect(r.queryAllByTestId('linha-feedback')).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────
// The row layout
// ─────────────────────────────────────────────

describe('LinhaFeedback', () => {
  it('renders a dislike row: the pill, the pt-BR date and the motivo', async () => {
    const r = await render(
      React.createElement(LinhaFeedback, {
        item: { data: '2026-09-15T09:15:00.000Z', nota: 'dislike', motivo: 'Resposta longa' },
      }),
    );
    r.getByTestId('nota-dislike');
    r.getByText('Não gostei');
    r.getByText('15/09/2026 09:15');
    r.getByText('Resposta longa');
  });

  it('renders a like row without motivo (the pill says "Gostei")', async () => {
    const r = await render(
      React.createElement(LinhaFeedback, {
        item: { data: '2026-09-18T14:32:00.000Z', nota: 'like' },
      }),
    );
    r.getByTestId('nota-like');
    r.getByText('Gostei');
    r.getByText('18/09/2026 14:32');
    expect(r.queryByText('Não gostei')).toBeNull();
  });
});

// ─────────────────────────────────────────────
// The seam helpers
// ─────────────────────────────────────────────

describe('seam helpers', () => {
  it('rotuloNota maps the backend tipo to the pt-BR label', () => {
    expect(rotuloNota('like')).toBe('Gostei');
    expect(rotuloNota('dislike')).toBe('Não gostei');
  });

  it('formataDataFeedback: ISO → dd/mm/aaaa hh:mm (string math)', () => {
    expect(formataDataFeedback('2026-09-19T14:32:00Z')).toBe('19/09/2026 14:32');
    expect(formataDataFeedback('2026-09-19T14:32:00.000Z')).toBe('19/09/2026 14:32');
    // No time part → date only.
    expect(formataDataFeedback('2026-09-19')).toBe('19/09/2026');
    // Unparseable input passes through untouched.
    expect(formataDataFeedback('hoje')).toBe('hoje');
  });
});
