/** Like/dislike under a finished answer; a dislike is saved at once and opens the reason/comment form. */
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';

import Glass from '../Glass';
import { Icone } from '../icons';
import { Botao, Campo, Texto } from '../ui';
import { haptics } from '../../lib/device';
import { removerFeedback, salvarFeedback, type Feedback as Salvo, type TipoFeedback } from '../../lib/feedback';
import { useTheme } from '../../theme';

const MOTIVOS = ['Informação incorreta', 'Resposta incompleta', 'Resposta confusa', 'Outro'];

export default function Feedback({ userId, conversaId, ordem, inicial }: {
  userId: string; conversaId: string; ordem: number; inicial?: Salvo | null;
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

  const polegar = (tipo: TipoFeedback, rotulo: string, cor: string) => (
    <Pressable accessibilityRole="button" accessibilityLabel={rotulo} accessibilityState={{ selected: nota === tipo }}
      onPress={() => void avaliar(tipo)} hitSlop={6}
      style={({ pressed }) => ({ width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md,
        backgroundColor: nota === tipo ? colors.surface : 'transparent', opacity: pressed ? 0.7 : 1 })}>
      <Icone nome={tipo} cor={nota === tipo ? cor : colors.mutedForeground} tamanho={17} />
    </Pressable>
  );

  return (
    <View style={{ marginTop: spacing.sm, gap: spacing.sm, maxWidth: 560 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
        <Texto v="legenda" cor={colors.mutedForeground}>A resposta foi útil?</Texto>
        {polegar('like', 'Resposta útil', colors.brand)}
        {polegar('dislike', 'Resposta ruim', colors.danger)}
      </View>
      {form ? (
        <Glass radius={radius.lg} style={{ padding: spacing.md, gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Texto v="suave" cor={colors.foreground} style={{ fontFamily: 'Roboto-Bold', flexShrink: 1 }}>Como podemos melhorar esta resposta?</Texto>
            <Pressable accessibilityLabel="Fechar" onPress={() => setForm(false)} hitSlop={8}><Icone nome="fechar" cor={colors.mutedForeground} tamanho={16} /></Pressable>
          </View>
          {estado === 'enviado' ? (
            <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'center' }}>
              <Icone nome="check" cor={colors.brand} tamanho={16} />
              <Texto v="legenda" cor={colors.brand}>Obrigado pelo seu feedback! Ele nos ajuda a melhorar.</Texto>
            </View>
          ) : (
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {MOTIVOS.map((m) => (
                  <Botao key={m} compacto v="secundario" rotulo={m} onPress={() => setMotivo(motivo === m ? '' : m)}
                    style={motivo === m ? { borderColor: colors.brand, borderWidth: 1.5 } : undefined} />
                ))}
              </View>
              <Campo multiline value={comentario} onChangeText={setComentario} maxLength={2000}
                placeholder="Conte o que esteve errado (opcional)…" accessibilityLabel="Comentário" />
              <Botao compacto rotulo="Enviar feedback" carregando={estado === 'salvando'} onPress={() => void enviar()} style={{ alignSelf: 'flex-end' }} />
            </>
          )}
        </Glass>
      ) : null}
      {estado === 'falhou' ? <Texto v="erro">Não foi possível salvar a avaliação.</Texto> : null}
    </View>
  );
}
