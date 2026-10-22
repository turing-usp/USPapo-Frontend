/**
 * A conversation: the thinking mark, streamed answers, sources, Copiar/Compartilhar and feedback, and
 * the composer floating over the list.
 *
 * Scrolling: each turn (a question and all that follows it) is a group, and the last one is at least
 * as tall as the room between the chrome and the composer, so the end of the list is the last
 * question at the top of the screen with room below it. A question just sent scrolls up there and
 * its answer is written into that room: nothing moves while it fits, and a longer one goes on under
 * the composer. The list follows the end only while a conversation opens and once the user has
 * scrolled down to it (or tapped the arrow that shows while there is more below).
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ALTURA_CHROME } from '../../../components/Chrome';
import { BotoesDaMensagem, MenuDasMensagens } from '../../../components/chat/AcoesDaMensagem';
import Andamento from '../../../components/chat/Andamento';
import Feedback from '../../../components/chat/Feedback';
import { BolhaAssistente, BolhaUsuario } from '../../../components/chat/Linhas';
import Composer from '../../../components/Composer';
import Glass, { CamadaDeVidro } from '../../../components/Glass';
import { Icone } from '../../../components/icons';
import { useSurgimento } from '../../../components/Movimento';
import { Coluna, Estado, Texto } from '../../../components/ui';
import { chatTemporario, useChat, type Linha } from '../../../lib/chat';
import { useAlturaDoTeclado } from '../../../lib/device';
import { feedbacksDaConversa, type Feedback as Salvo } from '../../../lib/feedback';
import { focarConversa } from '../../../lib/notificacoes';
import { useTheme } from '../../../theme';

/** Closer to the end than this, the list is at its end (it follows it from there). */
const PERTO = 80;
/** Further from the end than this, the arrow to the end shows. */
const LONGE = 240;
/** Our own animated scroll is over by then: until then its scroll events are not the user's. */
const ROLAGEM_MS = 700;
/** For this long after a send, the last turn's next layout scrolls its question up (the same turn: a retry)... */
const MESMO_TURNO_MS = 600;
/** ...and a new turn's first layout, for this long. */
const FIXAR_MS = 4000;

/** The arrow to the end: glass that pops in over the composer while there is more below. */
function IrAoFim({ visivel, base, aoTocar }: { visivel: boolean; base: number; aoTocar: () => void }) {
  const { colors, radius } = useTheme();
  const { montado, movimento } = useSurgimento(visivel, { de: 0.6 });
  if (!montado) return null;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: base, alignItems: 'center' }}>
      <Glass desfoque radius={radius.full} movimento={movimento} aperto={0.88} onPress={aoTocar} accessibilityLabel="Ir para o fim da conversa"
        style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
        <Icone nome="descer" cor={colors.foreground} tamanho={20} traco={2} />
      </Glass>
    </View>
  );
}

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Conversa key={String(id)} id={String(id)} />;
}

function Conversa({ id }: { id: string }) {
  const router = useRouter();
  const { layout, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const teclado = useAlturaDoTeclado();
  const lista = useRef<ScrollView>(null);
  // `seguindo`: the list keeps to its end. `auto`: our own animated scroll is under way. `fixar`: a
  // question was just sent (`antes`: the key of the turn that was last then), until its turn scrolls up.
  const rolagem = useRef({
    seguindo: true, y: 0, conteudo: 0, janela: 0, auto: false, fixar: null as { antes: string; mesmo: boolean } | null,
  });
  const relogios = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => relogios.current.forEach(clearTimeout), []);
  const depois = (ms: number, fazer: () => void) => {
    relogios.current.push(setTimeout(fazer, ms));
  };
  const [janela, setJanela] = useState(0);
  const [longe, setLonge] = useState(false);
  /**
   * How far the end is; the arrow shows when it is far. Not while the list moves by itself: a
   * question going up to the top (its turn first grows the room below) or the arrow's own scroll.
   */
  const medirDistancia = () => {
    const r = rolagem.current;
    const distancia = r.conteudo - r.y - r.janela;
    setLonge(r.janela > 0 && !r.auto && !r.fixar && distancia > LONGE);
    return distancia;
  };
  /** Our own animated scroll: its scroll events do not change whether the list follows the end. */
  const rolarSozinho = (rolar: () => void) => {
    rolagem.current.auto = true;
    depois(ROLAGEM_MS, () => {
      rolagem.current.auto = false;
      medirDistancia();
    });
    rolar();
  };
  const [texto, setTexto] = useState('');
  const [alturaComposer, setAlturaComposer] = useState(120);
  const [feedbacks, setFeedbacks] = useState<Record<number, Salvo>>({});
  const topo = insets.top + ALTURA_CHROME + spacing.xl + (chatTemporario(String(id)) ? 32 : 0);
  const fundo = alturaComposer + spacing.lg;

  // Now and again next frame: the new size reaches JS before the native content grows, so the first
  // scroll can stop short (streamed text, tool tags) and only the second one lands on the real end.
  const irAoFim = () => {
    lista.current?.scrollToEnd({ animated: false });
    requestAnimationFrame(() => lista.current?.scrollToEnd({ animated: false }));
  };

  const chat = useChat(String(id), {
    aoSessaoExpirada: () => router.replace('/login'),
    // The end of the answer is on screen (no "finished" buzz then).
    pertoDoFim: () => rolagem.current.conteudo - rolagem.current.y - rolagem.current.janela < PERTO,
  });
  const respondendo = chat.status === 'respondendo';
  // The live turn: its progress line stands in for the answer until the mark has become its cursor.
  const vivo = chat.ordem;
  const comecou = chat.linhas.some((l) => l.autor === 'assistant' && l.ordem === vivo && l.texto.length > 0);
  const pensando = respondendo && !comecou;
  const [cursor, setCursor] = useState<number | null>(null);
  const aguardando = comecou && cursor !== vivo && chat.status !== 'errou';
  if (pensando && cursor === vivo) setCursor(null); // a new attempt at the same turn collapses again
  // The question asked on the home is live from the start: it stays at the top like one sent here.
  const [veioDoInicio] = useState(respondendo);
  useEffect(() => {
    if (veioDoInicio) rolagem.current.seguindo = false;
  }, [veioDoInicio]);

  useEffect(() => {
    if (!chat.temporario && chat.userId && chat.status === 'idle') void feedbacksDaConversa(chat.userId, String(id)).then(setFeedbacks);
  }, [chat.userId, chat.status, chat.temporario, id]);

  // While this conversation is on screen its own "answer ready" push stays silent.
  const { descartar } = chat;
  useFocusEffect(useCallback(() => {
    focarConversa(String(id));
    return () => { focarConversa(null); descartar(); };
  }, [id, descartar]));

  // Keyed lines, so the progress line keeps its instance (and its animation) when the turn starts
  // writing, fails or is retried; an error or note after a partial answer gets a line of its own.
  const andamento = `andamento:${vivo}`;
  const renderizar = (item: Linha) => {
    switch (item.autor) {
      case 'user':
        return <BolhaUsuario key={item.id} texto={item.texto} nova={respondendo && item.id === `user:${vivo}`} />;
      case 'assistant':
        if (item.ordem === vivo && aguardando) return null;
        return (
          <BolhaAssistente key={item.id} linha={item} escrevendo={respondendo && !item.completo} revelar={item.ordem === vivo}>
            {!item.completo ? null : chat.userId && !chat.temporario ? (
              <Feedback userId={chat.userId} conversaId={String(id)} ordem={item.ordem} inicial={feedbacks[item.ordem] ?? null}
                acoes={<BotoesDaMensagem texto={item.texto} />} />
            ) : <BotoesDaMensagem texto={item.texto} style={{ marginTop: spacing.sm }} />}
          </BolhaAssistente>
        );
      case 'erro':
        return (
          <Andamento key={comecou ? item.id : andamento} estado="erro" texto={item.mensagem}
            aoTentar={respondendo || item.tipo === 'sessao' ? undefined : () => chat.send(chat.pergunta)} />
        );
      default:
        return <Andamento key={comecou ? item.id : andamento} estado="parado" texto={item.texto} />;
    }
  };
  // One group per turn (see the header): a question starts one, and everything after it joins it.
  const turnos: { chave: string; itens: ReactNode[] }[] = [];
  for (const item of chat.linhas) {
    if (item.autor === 'user' || !turnos.length) turnos.push({ chave: item.autor === 'user' ? item.id : 'inicio', itens: [] });
    turnos[turnos.length - 1].itens.push(renderizar(item));
  }
  if ((pensando || aguardando) && turnos.length) {
    turnos[turnos.length - 1].itens.push(
      <Andamento key={andamento} estado={aguardando ? 'escrevendo' : 'pensando'} texto={chat.etapa ?? 'Pensando'}
        aoConcluir={() => setCursor(vivo)} />,
    );
  }

  function enviar() {
    if (!texto.trim()) return;
    const r = rolagem.current;
    const fixar = { antes: turnos[turnos.length - 1]?.chave ?? '', mesmo: true };
    r.seguindo = false;
    r.fixar = fixar;
    setLonge(false);
    depois(MESMO_TURNO_MS, () => {
      fixar.mesmo = false;
    });
    depois(FIXAR_MS, () => {
      if (rolagem.current.fixar !== fixar) return;
      rolagem.current.fixar = null;
      medirDistancia();
    });
    chat.send(texto);
    setTexto('');
  }

  /** The last turn laid out: a question just sent scrolls up under the chrome (that is the end now). */
  function aoMedirTurno(chave: string, y: number) {
    const r = rolagem.current;
    if (!r.fixar || (chave === r.fixar.antes && !r.fixar.mesmo)) return;
    r.fixar = null;
    rolarSozinho(() => requestAnimationFrame(() => lista.current?.scrollTo({ y: Math.max(0, y - topo), animated: true })));
  }

  function aoTocarFim() {
    rolagem.current.seguindo = true;
    rolarSozinho(() => lista.current?.scrollToEnd({ animated: true }));
  }

  if (chat.carregou && !chat.linhas.length && chat.status === 'idle') {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Estado titulo={chat.temporario ? 'Chat temporário encerrado' : 'Conversa'}
          mensagem={chat.temporario ? 'O conteúdo foi descartado. Inicie uma nova conversa para continuar.' : 'Não encontrei esta conversa.'}
          acao="Novo chat" aoAgir={() => router.replace('/')} />
      </View>
    );
  }

  const minimoDoUltimo = Math.max(0, janela - topo - fundo);

  // The messages' long-press menu covers the screen, so it wraps everything.
  return (
    <MenuDasMensagens>
      {chat.temporario ? <View pointerEvents="none" style={{ position: 'absolute', top: insets.top + ALTURA_CHROME, left: 16, right: 16, zIndex: 1 }}>
        <Texto v="legenda" centro>Chat temporário · fora do histórico e da memória pessoal</Texto>
      </View> : null}
      <CamadaDeVidro
        fundo={
          // A ScrollView, not a FlatList: a conversation is short, and scrollToEnd must reach the real end
          // (a virtualized list estimates the unmeasured rows and stops short).
          <ScrollView
            ref={lista}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            scrollEventThrottle={32}
            onLayout={(e) => {
              rolagem.current.janela = e.nativeEvent.layout.height;
              setJanela(e.nativeEvent.layout.height);
            }}
            onScrollBeginDrag={() => {
              rolagem.current.auto = false;
            }}
            onScroll={({ nativeEvent: n }) => {
              const r = rolagem.current;
              const perto = n.contentSize.height - n.contentOffset.y - n.layoutMeasurement.height < PERTO;
              // Follow the end again once the user is back at it; stop when they scroll up.
              if (!r.auto) r.seguindo = perto || (r.seguindo && n.contentOffset.y >= r.y - 1);
              r.y = n.contentOffset.y;
              r.conteudo = n.contentSize.height;
              r.janela = n.layoutMeasurement.height;
              medirDistancia();
            }}
            onContentSizeChange={(_w, h) => {
              rolagem.current.conteudo = h;
              if (rolagem.current.seguindo) irAoFim();
              medirDistancia();
            }}
            contentContainerStyle={{
              alignSelf: 'center', width: '100%', maxWidth: layout.chatMaxWidth, gap: spacing.lg,
              paddingHorizontal: spacing.lg, paddingTop: topo, paddingBottom: fundo,
            }}
          >
            {turnos.map((turno, i) => {
              const ultimo = i === turnos.length - 1;
              return (
                <View key={turno.chave} style={{ gap: spacing.lg, minHeight: ultimo ? minimoDoUltimo : undefined }}
                  onLayout={ultimo ? (e) => aoMedirTurno(turno.chave, e.nativeEvent.layout.y) : undefined}>
                  {turno.itens}
                </View>
              );
            })}
          </ScrollView>
        }
        frente={
          // Only the composer floats: the messages scroll under it, blurred, and stay reachable around it.
          <>
            <IrAoFim visivel={longe} base={alturaComposer + spacing.sm} aoTocar={aoTocarFim} />
            <View onLayout={(e) => setAlturaComposer(e.nativeEvent.layout.height)} pointerEvents="box-none"
              style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: spacing.sm,
                paddingBottom: insets.bottom + (teclado ? teclado + spacing.sm : spacing.md) }}>
              <Coluna chat pointerEvents="box-none">
                <Composer desfoque value={texto} onChange={setTexto} onSubmit={enviar} respondendo={respondendo} onStop={chat.stop} />
              </Coluna>
            </View>
          </>
        }
      />
    </MenuDasMensagens>
  );
}
