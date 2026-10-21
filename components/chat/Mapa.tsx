/**
 * The ```uspapo-mapa``` widget: the bus ride of a transport answer over the campus base layer.
 *
 * Drawn with react-native-svg from local data (no tile server): the base layer ships with the app,
 * and the backend sends only the ride (lib/mapa.ts). Palette only, varied by opacity: streets,
 * buildings and the campus in the text color, water in blue, and the ride in `accent` (the role of
 * meaningful graphics: blue on light, orange on dark). Walking stretches are dashed straight lines,
 * honest about being estimates. Static by design: one SVG, no gestures, cheap inside a scrolling chat.
 */
import React, { memo, useEffect, useMemo, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { Texto } from '../ui';
import { BASE, buscarMapa, decodificar, enquadrar, linha, projetar, type Geometria, type Ponto } from '../../lib/mapa';
import { alfa, paleta, useTheme } from '../../theme';

/** Width / height of the box: a bit wider than tall, so the campus' east-west length fits. */
const ASPECTO = 1.5;
const ALTURA_MAXIMA = 340;

type Estado = { tipo: 'carregando' } | { tipo: 'pronto'; dados: Geometria } | { tipo: 'sem-mapa' } | { tipo: 'falhou' };

function useGeometria(campos: Record<string, string>, ativo: boolean): Estado {
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });
  const chave = JSON.stringify(campos);
  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    buscarMapa(JSON.parse(chave)).then(
      (dados) => vivo && setEstado(dados ? { tipo: 'pronto', dados } : { tipo: 'sem-mapa' }),
      () => vivo && setEstado({ tipo: 'falhou' }),
    );
    return () => {
      vivo = false;
    };
  }, [chave, ativo]);
  return estado;
}

function Desenho({ dados, largura }: { dados: Geometria; largura: number }) {
  const { colors, escuro } = useTheme();
  const altura = Math.min(ALTURA_MAXIMA, largura / ASPECTO);
  const desenho = useMemo(() => {
    const rota = decodificar(dados.rota).map(projetar);
    const [embarque, desembarque] = [projetar(dados.embarque), projetar(dados.desembarque)];
    const [origem, destino] = [dados.origem && projetar(dados.origem), dados.destino && projetar(dados.destino)];
    const pontos = [...rota, embarque, desembarque, ...(origem ? [origem] : []), ...(destino ? [destino] : [])];
    const caixa = enquadrar(pontos, largura / altura);
    return { rota, embarque, desembarque, origem, destino, caixa, px: caixa[2] / largura };
  }, [dados, largura, altura]);
  const { px } = desenho;
  // Sizes in screen pixels, converted to the viewBox's meters.
  const tamanho = (n: number) => n * px;
  const tinta = (opacidade: number) => alfa(colors.foreground, opacidade);
  const pe = (de: Ponto | null, ate: Ponto): React.ReactNode => de && (
    <Path d={linha([de, ate])} stroke={colors.mutedForeground} strokeWidth={tamanho(2)} strokeLinecap="round"
      strokeDasharray={[tamanho(0.1), tamanho(5)]} fill="none" />
  );
  return (
    <Svg width={largura} height={altura} viewBox={desenho.caixa.join(' ')}>
      <Path d={BASE.campus} fill={tinta(0.035)} stroke={tinta(0.16)} strokeWidth={tamanho(1)} />
      <Path d={BASE.agua} fill={alfa(paleta.azul, escuro ? 0.34 : 0.2)} />
      <Path d={BASE.predios} fill={tinta(0.09)} />
      <Path d={BASE.viasInternas} stroke={tinta(0.13)} strokeWidth={tamanho(1.5)} fill="none" strokeLinejoin="round" />
      <Path d={BASE.vias} stroke={tinta(0.2)} strokeWidth={tamanho(2.5)} fill="none" strokeLinejoin="round" />
      <Path d={BASE.trilhos} stroke={tinta(0.3)} strokeWidth={tamanho(1.5)} strokeDasharray={[tamanho(6), tamanho(4)]} fill="none" />
      {pe(desenho.origem, desenho.embarque)}
      {desenho.destino ? pe(desenho.desembarque, desenho.destino) : null}
      {/* A halo in the canvas color keeps the ride legible over streets and buildings. */}
      <Path d={linha(desenho.rota)} stroke={colors.canvas} strokeWidth={tamanho(7)} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d={linha(desenho.rota)} stroke={colors.accent} strokeWidth={tamanho(4)} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {desenho.origem ? (
        <Circle cx={desenho.origem[0]} cy={desenho.origem[1]} r={tamanho(4.5)} fill={colors.canvas} stroke={colors.foreground} strokeWidth={tamanho(2)} />
      ) : null}
      <Circle cx={desenho.embarque[0]} cy={desenho.embarque[1]} r={tamanho(6)} fill={colors.accent} stroke={colors.canvas} strokeWidth={tamanho(2)} />
      <Circle cx={desenho.desembarque[0]} cy={desenho.desembarque[1]} r={tamanho(5.5)} fill={colors.canvas} stroke={colors.accent} strokeWidth={tamanho(3)} />
      {desenho.destino ? (
        <Circle cx={desenho.destino[0]} cy={desenho.destino[1]} r={tamanho(6)} fill={colors.foreground} stroke={colors.canvas} strokeWidth={tamanho(2)} />
      ) : null}
    </Svg>
  );
}

/** The legend under the map: what each mark is, and the base layer's credit. */
function Legenda({ temDestino }: { temDestino: boolean }) {
  const { colors, spacing } = useTheme();
  const marca = (estilo: object) => <View style={[{ width: 10, height: 10, borderRadius: 5 }, estilo]} />;
  const item = (simbolo: React.ReactNode, rotulo: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>{simbolo}<Texto v="detalhe">{rotulo}</Texto></View>
  );
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.md, rowGap: 2,
      paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
      {item(marca({ backgroundColor: colors.accent }), 'embarque')}
      {item(marca({ borderWidth: 2.5, borderColor: colors.accent }), 'desembarque')}
      {temDestino ? item(marca({ backgroundColor: colors.foreground }), 'destino') : null}
      {item(<View style={{ width: 14, borderTopWidth: 2, borderStyle: 'dotted', borderColor: colors.mutedForeground }} />, 'a pé')}
      <Texto v="detalhe" style={{ marginLeft: 'auto' }}>© OpenStreetMap</Texto>
    </View>
  );
}

/**
 * `pronto`: the block is complete (an answer still streaming may hold half a reference). Until the
 * ride arrives the box keeps its final height, so the answer does not jump; a reference the
 * current timetable no longer has leaves no trace.
 */
export const Mapa = memo(function Mapa({ campos, pronto }: { campos: Record<string, string>; pronto: boolean }) {
  const { colors, radius, spacing } = useTheme();
  const [largura, setLargura] = useState(0);
  const estado = useGeometria(campos, pronto);
  const [entrada] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (estado.tipo === 'pronto' && largura) {
      Animated.timing(entrada, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }
  }, [estado.tipo, largura, entrada]);
  if (estado.tipo === 'sem-mapa') return null;
  const altura = largura ? Math.min(ALTURA_MAXIMA, largura / ASPECTO) : 0;
  const rotulo = campos.linha ? `Mapa do trajeto na linha ${campos.linha}` : 'Mapa do trajeto';
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={rotulo}
      style={{ borderWidth: 1, borderColor: alfa(colors.foreground, 0.14), borderRadius: radius.md, overflow: 'hidden', marginBottom: spacing.md }}>
      <View onLayout={(e) => setLargura(Math.floor(e.nativeEvent.layout.width))}
        style={{ width: '100%', height: altura || undefined, aspectRatio: altura ? undefined : ASPECTO, backgroundColor: alfa(colors.foreground, 0.03) }}>
        {estado.tipo === 'pronto' && largura ? (
          <Animated.View style={{ opacity: entrada }}><Desenho dados={estado.dados} largura={largura} /></Animated.View>
        ) : estado.tipo === 'falhou' ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Texto v="legenda">Não consegui carregar o mapa agora.</Texto></View>
        ) : null}
      </View>
      <Legenda temDestino={estado.tipo === 'pronto' && !!estado.dados.destino} />
    </View>
  );
});
