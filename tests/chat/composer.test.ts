/**
 * components/Composer tests: the two web behaviours that were broken.
 *
 * 1. THE HEIGHT. react-native-web reports `onContentSizeChange` as the
 *    textarea's `scrollHeight`, which is never smaller than the element's own
 *    box — so the old code, which set `height = measured + 20`, measured its
 *    own previous height and grew ~20px on every keystroke until it hit the
 *    ceiling. The composer now measures with the height released, so the
 *    height is a function of the text: typing must not change it while the
 *    text still fits one line.
 *
 * 2. ENTER. Enter sends and Shift+Enter breaks the line. react-native-web only
 *    routes Enter to `onSubmitEditing` for fields that blur on submit, which a
 *    chat composer must not do, so the composer handles the key itself.
 *
 * Both are web behaviours, and jest-expo's default project reports
 * `Platform.OS === 'ios'` — so the platform module is mocked to 'web' here.
 * That is the whole point of the suite: it exercises the branch the browser
 * takes.
 */
import React from 'react';
import { render } from '@testing-library/react-native';

// Must come before the component import: the composer reads Platform.OS.
jest.mock('react-native/Libraries/Utilities/Platform', () => ({
  __esModule: true,
  default: {
    OS: 'web',
    Version: undefined,
    isTV: false,
    isVision: false,
    isTesting: true,
    isDisableAnimations: true,
    constants: {},
    select: (especifico: Record<string, unknown>) =>
      'web' in especifico ? especifico.web : especifico.default,
  },
}));

import Composer from '../../components/Composer';

const mockTEMA = {
  scheme: 'light',
  colors: {
    brand: '#f1863d',
    brandForeground: '#ffffff',
    canvas: '#dde4f6',
    foreground: '#0b1030',
    mutedForeground: '#55618a',
    faintForeground: '#8790ad',
    danger: '#c53434',
  },
  fonts: { body: 'Roboto', bodyBold: 'Roboto-Bold' },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, '2xl': 24, '3xl': 32 },
  radius: { sm: 8, md: 12, lg: 16, xl: 24, full: 9999 },
  typography: {
    xs: { fontSize: 11, lineHeight: 15 },
    sm: { fontSize: 14, lineHeight: 20 },
    base: { fontSize: 16, lineHeight: 24 },
  },
  glass: {
    brand: { borderColor: 'rgba(255,255,255,0.40)', borderWidth: 1 },
    hairline: { borderColor: 'rgba(255,255,255,0.65)', borderWidth: 1 },
    shadow: { shadowColor: 'rgb(11,16,48)' },
  },
  // components/Glass paints the scene copy on web (components/Backdrop).
  scene: {
    backdropFrom: '#d3dcf2',
    backdropTo: '#eaeefb',
    glowA: 'rgba(241,134,61,0.20)',
    glowB: 'rgba(241,134,61,0.15)',
  },
};

// The factory is hoisted above `mockTEMA`, so anything it needs EAGERLY has to
// be built inside it; `useTheme` is a closure and reads the const lazily.
jest.mock('../../theme', () => ({
  useTheme: () => mockTEMA,
  fonts: { body: 'Roboto', bodyBold: 'Roboto-Bold' },
}));

jest.mock('../../lib/haptics', () => ({
  haptics: {
    press: jest.fn(async () => undefined),
    send: jest.fn(async () => undefined),
    error: jest.fn(async () => undefined),
  },
}));

/** What `render` resolves to (this version of RNTL returns a promise). */
type Tela = Awaited<ReturnType<typeof render>>;

/** The composer's input, found by its default placeholder. */
function entrada(r: Tela) {
  return r.getByPlaceholderText('Pesquise sobre a USP');
}

/** The `height` the input is currently laid out with. */
function alturaDe(campo: { props: Record<string, unknown> }): number | undefined {
  const estilos = ([] as unknown[]).concat(campo.props.style as unknown[]).flat();
  for (const estilo of estilos.reverse()) {
    const altura = (estilo as { height?: number } | null)?.height;
    if (typeof altura === 'number') return altura;
  }
  return undefined;
}

/** A react-native-web key event as the composer receives it. */
function teclaEnter(opcoes: { shiftKey?: boolean } = {}) {
  const preventDefault = jest.fn();
  return {
    preventDefault,
    nativeEvent: { key: 'Enter', shiftKey: opcoes.shiftKey ?? false },
  };
}

describe('Composer — height', () => {
  it('a one-line value is exactly as tall as the 44pt buttons beside it', async () => {
    const r = await render(
      React.createElement(Composer, {
        value: '',
        onChange: () => undefined,
        onSubmit: () => undefined,
      }),
    );
    expect(alturaDe(entrada(r))).toBe(44);
  });

  it('typing does not grow the box while the text still fits (the web loop)', async () => {
    const r = await render(
      React.createElement(Composer, {
        value: 'a',
        onChange: () => undefined,
        onSubmit: () => undefined,
      }),
    );
    const inicial = alturaDe(entrada(r));

    // Reproduce what react-native-web actually does on every keystroke: it
    // fires onContentSizeChange with the textarea's `scrollHeight`, which is
    // never smaller than the element's CURRENT height. The old handler fed
    // that number back as `height = medida + 20`, so this loop grew the box
    // by 20px per letter until it hit the ceiling.
    for (const valor of ['ab', 'abc', 'abcd', 'abcde', 'abcdef', 'abcdefg']) {
      const campo = entrada(r);
      const atual = alturaDe(campo) ?? 0;
      campo.props.onContentSizeChange({
        nativeEvent: { contentSize: { height: atual, width: 300 } },
      });
      await r.rerender(
        React.createElement(Composer, {
          value: valor,
          onChange: () => undefined,
          onSubmit: () => undefined,
        }),
      );
    }
    expect(alturaDe(entrada(r))).toBe(inicial);
  });

  it('asks the textarea for ONE row, so the released measure is one line', async () => {
    // react-native-web only sets `rows` when told to, and a textarea with no
    // `rows` attribute defaults to TWO — which would make an EMPTY composer
    // measure two lines tall the moment the height is released to be read.
    const r = await render(
      React.createElement(Composer, {
        value: '',
        onChange: () => undefined,
        onSubmit: () => undefined,
      }),
    );
    expect(entrada(r).props.rows).toBe(1);
  });
});

describe('Composer — Enter', () => {
  it('Enter submits the value and swallows the browser newline', async () => {
    const onSubmit = jest.fn<void, [string]>();
    const r = await render(
      React.createElement(Composer, {
        value: 'que horas abre o bandejão?',
        onChange: () => undefined,
        onSubmit,
      }),
    );
    const evento = teclaEnter();
    entrada(r).props.onKeyPress(evento);

    // `mock.calls` rather than toHaveBeenCalledWith: this project's jest
    // typings do not carry the mock-argument matchers.
    expect(onSubmit.mock.calls).toEqual([['que horas abre o bandejão?']]);
    expect(evento.preventDefault).toHaveBeenCalled();
  });

  it('Shift+Enter does not submit and lets the newline through', async () => {
    const onSubmit = jest.fn<void, [string]>();
    const r = await render(
      React.createElement(Composer, {
        value: 'primeira linha',
        onChange: () => undefined,
        onSubmit,
      }),
    );
    const evento = teclaEnter({ shiftKey: true });
    entrada(r).props.onKeyPress(evento);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(evento.preventDefault).not.toHaveBeenCalled();
  });

  it('Enter on an empty composer sends nothing', async () => {
    const onSubmit = jest.fn<void, [string]>();
    const r = await render(
      React.createElement(Composer, {
        value: '   ',
        onChange: () => undefined,
        onSubmit,
      }),
    );
    entrada(r).props.onKeyPress(teclaEnter());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('Enter while the answer is streaming sends nothing (the button says Stop)', async () => {
    const onSubmit = jest.fn<void, [string]>();
    const r = await render(
      React.createElement(Composer, {
        value: 'mais uma pergunta',
        onChange: () => undefined,
        onSubmit,
        respondendo: true,
      }),
    );
    entrada(r).props.onKeyPress(teclaEnter());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('an Enter an IME is still composing is left to the IME', async () => {
    const onSubmit = jest.fn<void, [string]>();
    const r = await render(
      React.createElement(Composer, {
        value: 'ある',
        onChange: () => undefined,
        onSubmit,
      }),
    );
    const evento = {
      preventDefault: jest.fn(),
      nativeEvent: { key: 'Enter', shiftKey: false, isComposing: true },
    };
    entrada(r).props.onKeyPress(evento);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(evento.preventDefault).not.toHaveBeenCalled();
  });
});
