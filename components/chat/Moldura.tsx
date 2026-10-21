/**
 * The frame every inline widget sits in (the map, the timetable, whatever comes next): a hairline
 * box with a title row, then the widget. The title row and the widget become the image; the actions
 * beside the title stay out of it: Ampliar (components/chat/Visualizador draws the widget again full
 * screen, with zoom), Baixar (the gallery on Android and iOS, a download on the web) and Compartilhar
 * where the system shares images (lib/imagem). They wait until the widget is drawn.
 */
import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, View } from 'react-native';

import { ICONE_COMPARTILHAR } from './AcoesDaMensagem';
import { Visualizador } from './Visualizador';
import { BotaoDeIcone, MarcaDagua, Texto } from '../ui';
import { haptics } from '../../lib/device';
import { PODE_COMPARTILHAR_IMAGEM, compartilharImagem, salvarImagem, type ResultadoDaImagem } from '../../lib/imagem';
import { alfa, useTheme } from '../../theme';

const AVISOS: Partial<Record<ResultadoDaImagem, string>> = {
  salva: Platform.OS === 'web' ? 'Imagem baixada.' : 'Imagem salva na galeria.',
  negada: 'Sem permissão para salvar na galeria: libere o acesso às fotos nos Ajustes.',
  falhou: 'Não consegui gerar a imagem agora.',
};
const BOTAO = 32;

export type EstadoDoWidget<T> = { tipo: 'carregando' } | { tipo: 'pronto'; dados: T } | { tipo: 'sumiu' } | { tipo: 'falhou' };

/**
 * The data behind a widget's reference, fetched once its block is complete (`ativo`: an answer still
 * streaming may hold half a reference). `sumiu`: the reference no longer exists (a newer timetable).
 */
export function useDadosDoWidget<T>(buscar: (campos: Record<string, string>) => Promise<T | null>,
  campos: Record<string, string>, ativo: boolean): EstadoDoWidget<T> {
  const [estado, setEstado] = useState<EstadoDoWidget<T>>({ tipo: 'carregando' });
  const chave = JSON.stringify(campos);
  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    buscar(JSON.parse(chave)).then(
      (dados) => vivo && setEstado(dados ? { tipo: 'pronto', dados } : { tipo: 'sumiu' }),
      () => vivo && setEstado({ tipo: 'falhou' }),
    );
    return () => {
      vivo = false;
    };
  }, [buscar, chave, ativo]);
  return estado;
}

export function Moldura({ titulo, detalhe, arquivo, pronto, ampliado, children }: {
  titulo: string;
  /** Beside the title, in Roboto Mono (a line, a weekly total). */
  detalhe?: string;
  /** The image's file name, without the extension. */
  arquivo: string;
  /** The widget is drawn: it can be saved and expanded. */
  pronto: boolean;
  /** The widget drawn at a given width (and the room on screen), for the full-screen viewer. */
  ampliado: (largura: number, altura: number) => ReactNode;
  children: ReactNode;
}) {
  const { colors, fonts, radius, spacing, typography } = useTheme();
  const imagem = useRef<View>(null);
  const [aberto, setAberto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [salva, setSalva] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const agir = async (acao: typeof salvarImagem) => {
    setOcupado(true);
    const resultado = await acao(imagem, arquivo);
    setOcupado(false);
    if (resultado === 'salva') {
      void haptics.finished();
      setSalva(true);
      setTimeout(() => setSalva(false), 1800);
    } else if (resultado === 'negada' || resultado === 'falhou') {
      void haptics.error();
    }
    const texto = AVISOS[resultado];
    if (!texto) return;
    setAviso(texto);
    setTimeout(() => setAviso(null), 3000);
    if (Platform.OS !== 'web') AccessibilityInfo.announceForAccessibility(texto);
  };
  const acoes = (lado: number) => (
    <>
      <BotaoDeIcone icone={salva ? 'check' : 'baixar'} rotulo={salva ? 'Imagem salva' : 'Baixar imagem'} lado={lado}
        cor={salva ? colors.accent : undefined} desabilitado={!pronto || ocupado} onPress={() => void agir(salvarImagem)} />
      {PODE_COMPARTILHAR_IMAGEM ? (
        <BotaoDeIcone icone={ICONE_COMPARTILHAR} rotulo="Compartilhar imagem" lado={lado} desabilitado={!pronto || ocupado}
          onPress={() => void agir(compartilharImagem)} />
      ) : null}
    </>
  );
  const quantos = PODE_COMPARTILHAR_IMAGEM ? 3 : 2;

  return (
    <View style={{ borderWidth: 1, borderColor: alfa(colors.foreground, 0.14), borderRadius: radius.md, overflow: 'hidden', marginBottom: spacing.md }}>
      {/* Square and opaque: the image has no transparent corners. */}
      <View ref={imagem} collapsable={false} style={{ backgroundColor: colors.canvas }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: spacing.sm,
          paddingLeft: spacing.md, paddingRight: quantos * BOTAO + spacing.sm, paddingTop: spacing.sm }}>
          <Texto style={{ fontFamily: fonts.title, ...typography.base, color: colors.foreground }}>{titulo}</Texto>
          {detalhe ? <Texto v="detalhe">{detalhe}</Texto> : null}
        </View>
        {children}
        <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.sm }}><MarcaDagua /></View>
      </View>
      {aviso ? (
        <Texto v="legenda" accessibilityLiveRegion="polite" style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.sm }}>{aviso}</Texto>
      ) : null}
      <View style={{ position: 'absolute', top: 4, right: 4, flexDirection: 'row' }}>
        <BotaoDeIcone icone="expandir" rotulo={`Ampliar: ${titulo}`} lado={BOTAO} desabilitado={!pronto} onPress={() => setAberto(true)} />
        {acoes(BOTAO)}
      </View>
      <Visualizador aberto={aberto} aoFechar={() => setAberto(false)} titulo={titulo} detalhe={detalhe} aviso={aviso} acoes={acoes(36)}>
        {ampliado}
      </Visualizador>
    </View>
  );
}
