/**
 * Like/dislike under a finished answer, after its other actions (`acoes`); a dislike is saved at
 * once and opens the reason/comment form.
 */
import React, { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import Glass from '../Glass';
import { Icone } from '../icons';
import { Botao, BotaoDeIcone, Campo, Erro, Texto } from '../ui';
import { haptics } from '../../lib/device';
import { removerFeedback, salvarFeedback, type Feedback as Salvo, type TipoFeedback } from '../../lib/feedback';
import { alfa, useTheme } from '../../theme';

const MOTIVOS = ['Informação incorreta', 'Resposta incompleta', 'Resposta confusa', 'Outro'];

export default function Feedback({ userId, conversaId, ordem, inicial, acoes }: {
  userId: string; conversaId: string; ordem: number; inicial?: Salvo | null; acoes?: ReactNode;
}) {
  const { colors, radius, spacing } = useTheme();
  const [nota, setNota] = useState<TipoFeedback | null>(inicial?.tipo ?? null);
  const [motivo, setMotivo] = useState(inicial?.motivo ?? '');
  const [comentario, setComentario] = useState(inicial?.comentario ?? '');
  const [form, setForm] = useState(false);
  const [estado, setEstado] = useState<'livre' | 'salvando' | 'enviado' | 'falhou'>('livre');
  // The stored rating arrives after the first render: apply it during render, not in an effect.
  const [aplicado, setAplicado] = useState(inicial);
  if (inicial !== aplicado) {
    setAplicado(inicial);
    setNota(inicial?.tipo ?? null);
    setMotivo(inicial?.motivo ?? '');
    setComentario(inicial?.comentario ?? '');
  }

  const chave = { userId, conversaId, ordem };
  async function avaliar(tipo: TipoFeedback) {
    if (estado === 'salvando') return;
    const nova = nota === tipo ? null : tipo;
    const anterior = nota;
    setNota(nova);
    setForm(nova === 'dislike');
    setEstado('salvando');
    const ok = nova ? await salvarFeedback({ ...chave, tipo: nova, motivo, comentario }) : await removerFeedback(chave);
    setEstado(ok ? 'livre' : 'falhou');
    if (!ok) {
      setNota(anterior);
      void haptics.error();
    } else void (nova === 'dislike' ? haptics.dislike() : haptics.like());
  }

  async function enviar() {
    setEstado('salvando');
    const ok = await salvarFeedback({ ...chave, tipo: 'dislike', motivo, comentario });
    setEstado(ok ? 'enviado' : 'falhou');
    void (ok ? haptics.like() : haptics.error());
  }

  // The chosen thumb takes the accent over a tint of it; both thumbs look alike otherwise.
  const polegar = (tipo: TipoFeedback, rotulo: string) => (
    <BotaoDeIcone icone={tipo} rotulo={rotulo} ativo={nota === tipo} lado={34} onPress={() => void avaliar(tipo)} />
  );

  return (
    <View style={{ marginTop: spacing.sm, gap: spacing.sm, maxWidth: 560 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
        {acoes ? <>{acoes}<View style={{ width: 1, height: 18, marginHorizontal: spacing.xs, backgroundColor: alfa(colors.foreground, 0.12) }} /></> : null}
        <Texto v="legenda">A resposta foi útil?</Texto>
        {polegar('like', 'Resposta útil')}
        {polegar('dislike', 'Resposta ruim')}
      </View>
      {form ? (
        <Glass radius={radius.lg} style={{ padding: spacing.md, gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Texto v="subtitulo" style={{ flexShrink: 1 }}>Como podemos melhorar esta resposta?</Texto>
            <BotaoDeIcone icone="fechar" rotulo="Fechar" onPress={() => setForm(false)} tamanho={16} lado={28} rente />
          </View>
          {estado === 'enviado' ? (
            <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'center' }}>
              <Icone nome="check" cor={colors.accent} tamanho={16} />
              <Texto v="legenda" cor={colors.accent} style={{ flexShrink: 1 }}>Obrigado pelo seu feedback! Ele nos ajuda a melhorar.</Texto>
            </View>
          ) : (
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {MOTIVOS.map((m) => (
                  <Botao key={m} compacto v={motivo === m ? 'primario' : 'secundario'} rotulo={m} onPress={() => setMotivo(motivo === m ? '' : m)} />
                ))}
              </View>
              <Campo multiline value={comentario} onChangeText={setComentario} maxLength={2000}
                placeholder="Conte o que esteve errado (opcional)…" accessibilityLabel="Comentário" />
              <Botao compacto rotulo="Enviar feedback" carregando={estado === 'salvando'} onPress={() => void enviar()} style={{ alignSelf: 'flex-end' }} />
            </>
          )}
        </Glass>
      ) : null}
      {estado === 'falhou' ? <Erro>Não foi possível salvar a avaliação.</Erro> : null}
    </View>
  );
}
