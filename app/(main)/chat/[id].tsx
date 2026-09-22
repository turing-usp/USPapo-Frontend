/** A conversation: streamed answers, status tags, sources, feedback, and the composer floating over the list. */
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ALTURA_CHROME } from '../../../components/Chrome';
import Feedback from '../../../components/chat/Feedback';
import { BolhaAssistente, BolhaUsuario, LinhaErro, LinhaFerramenta, LinhaNota, Pensando } from '../../../components/chat/Linhas';
import Composer from '../../../components/Composer';
import Glass, { CamadaDeVidro } from '../../../components/Glass';
import { Coluna, Estado, Texto } from '../../../components/ui';
import { useChat, type Linha } from '../../../lib/chat';
import { useAlturaDoTeclado } from '../../../lib/device';
import { feedbacksDaConversa, type Feedback as Salvo } from '../../../lib/feedback';
import { useTheme } from '../../../theme';

const AVISO_IA = 'O USPapo é uma IA e pode cometer erros. Sempre verifique as respostas.';

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { layout, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const teclado = useAlturaDoTeclado();
  const lista = useRef<FlatList<Linha>>(null);
  const pertoDoFim = useRef(true);
  const [texto, setTexto] = useState('');
  const [alturaComposer, setAlturaComposer] = useState(120);
  const [feedbacks, setFeedbacks] = useState<Record<number, Salvo>>({});

  const chat = useChat(String(id), {
    aoSessaoExpirada: () => router.replace('/login'),
    pertoDoFim: () => pertoDoFim.current,
  });
  const respondendo = chat.status === 'respondendo';
  const ferramentaRodando = chat.linhas.some((l) => l.autor === 'ferramenta' && !l.pronta);

  useEffect(() => {
    if (chat.userId && chat.status === 'idle') void feedbacksDaConversa(chat.userId, String(id)).then(setFeedbacks);
  }, [chat.userId, chat.status, id]);

  function enviar() {
    if (!texto.trim()) return;
    chat.send(texto);
    setTexto('');
    pertoDoFim.current = true;
  }

  if (chat.carregou && !chat.linhas.length && chat.status === 'idle') {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Estado titulo="Conversa" mensagem="Não encontrei esta conversa." acao="Nova conversa" aoAgir={() => router.replace('/')} />
      </View>
    );
  }

  const renderizar = ({ item }: { item: Linha }) => {
    switch (item.autor) {
      case 'user':
        return <BolhaUsuario texto={item.texto} />;
      case 'assistant':
        return (
          <BolhaAssistente linha={item}>
            {item.completo && chat.userId ? (
              <Feedback userId={chat.userId} conversaId={String(id)} ordem={item.ordem} inicial={feedbacks[item.ordem] ?? null} />
            ) : null}
          </BolhaAssistente>
        );
      case 'ferramenta':
        return <LinhaFerramenta linha={item} />;
      case 'erro':
        return <LinhaErro linha={item} aoTentar={respondendo ? undefined : () => chat.send(chat.pergunta)} />;
      default:
        return <LinhaNota texto={item.texto} />;
    }
  };

  return (
    <CamadaDeVidro
      fundo={
        <FlatList
          ref={lista}
          data={chat.linhas}
          keyExtractor={(l) => l.id}
          renderItem={renderizar}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          scrollEventThrottle={32}
          onScroll={({ nativeEvent: n }) => {
            pertoDoFim.current = n.contentSize.height - n.contentOffset.y - n.layoutMeasurement.height < 240;
          }}
          onContentSizeChange={() => pertoDoFim.current && lista.current?.scrollToEnd({ animated: !respondendo })}
          ListFooterComponent={respondendo && !chat.escrevendo && !ferramentaRodando ? <Pensando /> : null}
          contentContainerStyle={{
            alignSelf: 'center', width: '100%', maxWidth: layout.chatMaxWidth, gap: spacing.lg,
            paddingHorizontal: spacing.lg, paddingTop: insets.top + ALTURA_CHROME + spacing.xl, paddingBottom: alturaComposer + spacing.lg,
          }}
        />
      }
      frente={
        // A frosted bar: the messages scroll under it blurred, and the AI notice stays fixed and legible.
        <View onLayout={(e) => setAlturaComposer(e.nativeEvent.layout.height)} style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
          <Glass desfoque variante="panel" semSombra borda={{ borderWidth: 0, borderTopWidth: 1 }}
            style={{ gap: spacing.sm, paddingTop: spacing.md, paddingBottom: Math.max(insets.bottom, spacing.sm) + teclado }}>
            <Coluna chat>
              <Composer value={texto} onChange={setTexto} onSubmit={enviar} respondendo={respondendo} onStop={chat.stop} />
            </Coluna>
            <Texto v="legenda" centro style={{ paddingHorizontal: spacing.lg }}>{AVISO_IA}</Texto>
          </Glass>
        </View>
      }
    />
  );
}
