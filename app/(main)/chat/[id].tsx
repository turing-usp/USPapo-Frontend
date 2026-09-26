/** A conversation: streamed answers, status tags, sources, feedback, and the composer floating over the list. */
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ALTURA_CHROME } from '../../../components/Chrome';
import Feedback from '../../../components/chat/Feedback';
import { BolhaAssistente, BolhaUsuario, LinhaErro, LinhaFerramenta, LinhaNota, Pensando } from '../../../components/chat/Linhas';
import Composer from '../../../components/Composer';
import { CamadaDeVidro } from '../../../components/Glass';
import { Coluna, Estado } from '../../../components/ui';
import { useChat, type Linha } from '../../../lib/chat';
import { useAlturaDoTeclado } from '../../../lib/device';
import { feedbacksDaConversa, type Feedback as Salvo } from '../../../lib/feedback';
import { focarConversa } from '../../../lib/notificacoes';
import { useTheme } from '../../../theme';

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { layout, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const teclado = useAlturaDoTeclado();
  const lista = useRef<ScrollView>(null);
  // Follow the end until the user scrolls up; coming back near the end follows again. Our own
  // scrollToEnd only moves down, so it never stops the following (a flag set in onScroll would).
  const rolagem = useRef({ seguindo: true, y: 0 });
  // Now and again next frame: the new size reaches JS before the native content grows, so the first
  // scroll can stop short (streamed text, tool tags) and only the second one lands on the real end.
  const irAoFim = () => {
    lista.current?.scrollToEnd({ animated: false });
    requestAnimationFrame(() => lista.current?.scrollToEnd({ animated: false }));
  };
  const [texto, setTexto] = useState('');
  const [alturaComposer, setAlturaComposer] = useState(120);
  const [feedbacks, setFeedbacks] = useState<Record<number, Salvo>>({});

  const chat = useChat(String(id), {
    aoSessaoExpirada: () => router.replace('/login'),
    pertoDoFim: () => rolagem.current.seguindo,
  });
  const respondendo = chat.status === 'respondendo';
  const ferramentaRodando = chat.linhas.some((l) => l.autor === 'ferramenta' && !l.pronta);

  useEffect(() => {
    if (chat.userId && chat.status === 'idle') void feedbacksDaConversa(chat.userId, String(id)).then(setFeedbacks);
  }, [chat.userId, chat.status, id]);

  // While this conversation is on screen its own "answer ready" push stays silent.
  useFocusEffect(useCallback(() => {
    focarConversa(String(id));
    return () => focarConversa(null);
  }, [id]));

  function enviar() {
    if (!texto.trim()) return;
    chat.send(texto);
    setTexto('');
    rolagem.current.seguindo = true;
  }

  if (chat.carregou && !chat.linhas.length && chat.status === 'idle') {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Estado titulo="Conversa" mensagem="Não encontrei esta conversa." acao="Nova conversa" aoAgir={() => router.replace('/')} />
      </View>
    );
  }

  const renderizar = (item: Linha) => {
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
        // A ScrollView, not a FlatList: a conversation is short, and scrollToEnd must reach the real end
        // (a virtualized list estimates the unmeasured rows and stops short).
        <ScrollView
          ref={lista}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          scrollEventThrottle={32}
          onScroll={({ nativeEvent: n }) => {
            const r = rolagem.current;
            const perto = n.contentSize.height - n.contentOffset.y - n.layoutMeasurement.height < 80;
            r.seguindo = perto || (r.seguindo && n.contentOffset.y >= r.y - 1);
            r.y = n.contentOffset.y;
          }}
          onContentSizeChange={() => rolagem.current.seguindo && irAoFim()}
          contentContainerStyle={{
            alignSelf: 'center', width: '100%', maxWidth: layout.chatMaxWidth, gap: spacing.lg,
            paddingHorizontal: spacing.lg, paddingTop: insets.top + ALTURA_CHROME + spacing.xl, paddingBottom: alturaComposer + spacing.lg,
          }}
        >
          {chat.linhas.map((l) => <React.Fragment key={l.id}>{renderizar(l)}</React.Fragment>)}
          {respondendo && !chat.escrevendo && !ferramentaRodando ? <Pensando /> : null}
        </ScrollView>
      }
      frente={
        // Only the composer floats: the messages scroll under it, blurred, and stay reachable around it.
        <View onLayout={(e) => setAlturaComposer(e.nativeEvent.layout.height)} pointerEvents="box-none"
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: spacing.sm,
            paddingBottom: insets.bottom + (teclado ? teclado + spacing.sm : spacing.md) }}>
          <Coluna chat pointerEvents="box-none">
            <Composer desfoque value={texto} onChange={setTexto} onSubmit={enviar} respondendo={respondendo} onStop={chat.stop} />
          </Coluna>
        </View>
      }
    />
  );
}
