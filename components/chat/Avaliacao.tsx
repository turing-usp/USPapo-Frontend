/**
 * The ```uspapo-avaliacao``` widget: a professor's grades on USP Avalia (lib/avaliacao).
 *
 * The graded courses as rows (most votes first), each a button: its mean (0 to 10, in Changa) over
 * a thin bar, and how many students voted. The chosen one opens its five quesitos as bars, the
 * spread beside each mean (±). Dificuldade is drawn in the text color, not the accent: a
 * high one is a demanding course, not a bad professor, which its label says. A mean from one or
 * two votes is marked as fragile, and the footer says what the site is (students' opinion, not an
 * official source), with a link to it.
 */
import React, { memo, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';

import { Carregando, Moldura, useDadosDoWidget } from './Moldura';
import { Texto, tintaDoToque } from '../ui';
import {
  DIFICULDADE, buscarAvaliacao, fichaInicial, fragil, nota, separarSigla,
  type DadosDaAvaliacao, type DisciplinaAvaliada, type Quesito,
} from '../../lib/avaliacao';
import { alfa, useTheme } from '../../theme';

/** A 0-10 value as a filled track (the spread is said beside it, as ±). */
function Barra({ valor, cor, altura = 6 }: { valor: number; cor: string; altura?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ height: altura + 4, justifyContent: 'center' }}>
      <View style={{ height: altura, borderRadius: altura / 2, backgroundColor: alfa(colors.foreground, 0.08), overflow: 'hidden' }}>
        <View style={{ width: `${Math.max(0, Math.min(100, valor * 10))}%`, height: '100%', borderRadius: altura / 2, backgroundColor: cor }} />
      </View>
    </View>
  );
}

function Quesitos({ disciplina }: { disciplina: DisciplinaAvaliada }) {
  const { colors, fonts, spacing, typography } = useTheme();
  const linha = (q: Quesito) => {
    const dificuldade = q.nome === DIFICULDADE;
    return (
      <View key={q.nome} accessible accessibilityLabel={`${q.nome}: ${nota(q.media)} de 10${q.desvio ? `, variando cerca de ${nota(q.desvio)}` : ''}`}
        style={{ gap: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
          <Texto v="legenda" style={{ flex: 1, color: colors.foreground }}>
            {q.nome}{dificuldade ? <Texto v="legenda"> · alta é matéria puxada</Texto> : null}
          </Texto>
          <Texto style={{ fontFamily: fonts.mono, ...typography.xs, color: colors.foreground }}>
            {nota(q.media)}{q.desvio ? <Texto v="detalhe"> ±{nota(q.desvio)}</Texto> : null}
          </Texto>
        </View>
        <Barra valor={q.media} cor={dificuldade ? alfa(colors.foreground, 0.55) : colors.accent} />
      </View>
    );
  };
  return <View style={{ gap: spacing.sm }}>{disciplina.quesitos.map(linha)}</View>;
}

function Conteudo({ dados, ficha, aoEscolher, largura }: {
  dados: DadosDaAvaliacao; ficha: number | null; aoEscolher?: (ficha: number) => void; largura?: number;
}) {
  const { colors, fonts, radius, spacing, typography } = useTheme();
  const escolhida = dados.disciplinas.find((d) => d.ficha === ficha) ?? dados.disciplinas[0];
  return (
    <View style={{ width: largura, paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.xs, gap: spacing.md }}>
      <View>
        <Texto style={{ fontFamily: fonts.title, ...typography.base, color: colors.foreground }}>{dados.nome}</Texto>
        {dados.unidade ? <Texto v="legenda">{dados.unidade}</Texto> : null}
      </View>
      <View style={{ gap: spacing.xs }}>
        {dados.disciplinas.map((d) => {
          const [nome, sigla] = separarSigla(d.nome);
          const ativa = d === escolhida;
          return (
            <Pressable key={d.ficha} accessibilityRole="button" accessibilityState={{ selected: ativa }}
              accessibilityLabel={`${nome}${sigla ? ` (${sigla})` : ''}: média ${nota(d.nota)} de 10, ${d.votos ?? 'alguns'} votos`}
              disabled={!aoEscolher} onPress={() => aoEscolher?.(d.ficha)}
              style={(e) => ({ padding: spacing.sm, borderRadius: radius.md, borderWidth: 1,
                borderColor: ativa ? alfa(colors.accent, 0.6) : alfa(colors.foreground, 0.1),
                backgroundColor: ativa ? alfa(colors.accent, 0.08) : tintaDoToque(e, colors.foreground) })}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Texto numberOfLines={2} style={{ ...typography.sm, fontFamily: fonts.body, color: colors.foreground }}>{nome}</Texto>
                  <Texto v="detalhe">
                    {[sigla, d.votos !== null ? `${d.votos} ${d.votos === 1 ? 'voto' : 'votos'}` : '', fragil(d.votos) ? 'poucos votos' : '']
                      .filter(Boolean).join(' · ')}
                  </Texto>
                </View>
                <Texto style={{ fontFamily: fonts.title, ...typography.xl, color: ativa ? colors.accent : colors.foreground }}>{nota(d.nota)}</Texto>
              </View>
              <Barra valor={d.nota} cor={ativa ? colors.accent : alfa(colors.foreground, 0.45)} altura={4} />
            </Pressable>
          );
        })}
      </View>
      {escolhida?.quesitos.length ? <Quesitos disciplina={escolhida} /> : null}
      <View style={{ gap: 2 }}>
        <Texto v="legenda">
          Opinião de alunos no USP Avalia, não é avaliação oficial da USP.
          {dados.sem_avaliacao ? ` Mais ${dados.sem_avaliacao} ${dados.sem_avaliacao === 1 ? 'disciplina' : 'disciplinas'} sem nenhum voto.` : ''}
        </Texto>
        <Texto v="link" accessibilityRole="link" onPress={() => void Linking.openURL(dados.fonte).catch(() => undefined)}>
          Ver comentários no USP Avalia
        </Texto>
      </View>
    </View>
  );
}

/** `pronto`: the block is complete. A professor the site no longer has leaves no trace. */
export const Avaliacao = memo(function Avaliacao({ campos, pronto }: { campos: Record<string, string>; pronto: boolean }) {
  const { spacing } = useTheme();
  const estado = useDadosDoWidget(buscarAvaliacao, campos, pronto);
  const [ficha, setFicha] = useState<number | null>(null);
  if (estado.tipo === 'sumiu' || (estado.tipo === 'pronto' && !estado.dados.disciplinas.length)) return null;
  const dados = estado.tipo === 'pronto' ? estado.dados : null;
  const atual = ficha ?? (dados ? fichaInicial(dados, campos.ficha) : null);
  return (
    <Moldura titulo="Avaliação de alunos" detalhe="USP Avalia" fonte="USP Avalia · opinião de alunos" arquivo={`uspapo-avaliacao-${campos.professor ?? ''}`}
      pronto={!!dados}
      ampliado={(l) => (dados ? <Conteudo dados={dados} ficha={atual} aoEscolher={setFicha} largura={Math.min(l, 560)} /> : null)}>
      {dados ? <Conteudo dados={dados} ficha={atual} aoEscolher={setFicha} /> : (
        <View style={{ minHeight: 120, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md }}>
          {estado.tipo === 'falhou' ? <Texto v="legenda">Não consegui abrir o USP Avalia agora.</Texto> : <Carregando />}
        </View>
      )}
    </Moldura>
  );
});
