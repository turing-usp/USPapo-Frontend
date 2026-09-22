/** Admin panel (web): KPIs, daily series, rankings, providers, top users and the feedback review. */
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';

import { Colunas, Ranking } from '../../components/charts';
import Glass from '../../components/Glass';
import { Icone } from '../../components/icons';
import { Botao, Cartao, Estado, Texto } from '../../components/ui';
import { JANELAS, carregarResumo, dataHora, diaCurto, duracao, numero, porcento, segundos, type ItemFeedback, type Resumo } from '../../lib/admin';
import { ApiError, ferramenta } from '../../lib/api';
import { useTheme } from '../../theme';

function Kpi({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe: string }) {
  const { spacing } = useTheme();
  return (
    <Glass radius={16} style={{ flexGrow: 1, flexBasis: 170, gap: spacing.xs, padding: spacing.lg }} testID="kpi">
      <Texto v="suave">{rotulo}</Texto>
      <Texto style={{ fontFamily: 'Roboto-Bold', fontSize: 28, lineHeight: 34 }}>{valor}</Texto>
      <Texto v="legenda">{detalhe}</Texto>
    </Glass>
  );
}

function Tabela({ colunas, linhas }: { colunas: string[]; linhas: (string | number)[][] }) {
  const { colors, spacing } = useTheme();
  if (!linhas.length) return <Texto v="legenda">Sem dados no período.</Texto>;
  return (
    <ScrollView horizontal>
      <View style={{ minWidth: '100%' }}>
        {[colunas, ...linhas].map((linha, i) => (
          <View key={i} style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.line + '14', paddingVertical: spacing.xs }}>
            {linha.map((celula, j) => (
              <Texto key={j} v={i ? 'suave' : 'secao'} cor={i && !j ? colors.foreground : undefined} numberOfLines={1}
                style={{ width: j ? 96 : 180, textAlign: j ? 'right' : 'left', fontVariant: ['tabular-nums'] }}>{String(celula)}</Texto>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const FILTROS = [['todos', 'Todos'], ['like', 'Úteis'], ['dislike', 'Não úteis'], ['comentario', 'Com comentário']] as const;

function ItemAvaliacao({ item }: { item: ItemFeedback }) {
  const { colors, radius, spacing } = useTheme();
  const [aberto, setAberto] = useState(false);
  return (
    <Glass radius={radius.md} style={{ padding: spacing.md, gap: spacing.sm }}>
      <Pressable onPress={() => setAberto((a) => !a)} accessibilityRole="button" accessibilityState={{ expanded: aberto }}
        style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
        <Icone nome={item.tipo} cor={item.tipo === 'like' ? colors.success : colors.danger} tamanho={18} />
        <View style={{ flex: 1 }}>
          <Texto v="suave" cor={colors.foreground} numberOfLines={aberto ? undefined : 1}>{item.pergunta ?? item.titulo ?? 'Conversa apagada'}</Texto>
          <Texto v="legenda">{[dataHora(item.created_at), item.usuario, item.motivo].filter(Boolean).join(' · ')}</Texto>
        </View>
        <View style={{ transform: [{ rotate: aberto ? '90deg' : '0deg' }] }}><Icone nome="seta" cor={colors.mutedForeground} tamanho={16} /></View>
      </Pressable>
      {item.comentario ? <Texto v="suave" style={{ fontStyle: 'italic' }}>“{item.comentario}”</Texto> : null}
      {aberto ? (
        <View style={{ gap: spacing.xs, borderLeftWidth: 2, borderColor: colors.brand, paddingLeft: spacing.md }}>
          <Texto v="suave" cor={colors.foreground} selectable>{item.resposta ?? 'Resposta indisponível (conversa apagada ou pendente).'}</Texto>
          {item.fontes.map((f) => <Texto key={f} v="legenda" selectable>{f}</Texto>)}
        </View>
      ) : null}
    </Glass>
  );
}

export default function Analytics() {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [dias, setDias] = useState<number>(30);
  const [dados, setDados] = useState<Resumo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number][0]>('todos');

  const carregar = useCallback((janela: number, signal?: AbortSignal) => carregarResumo(janela, signal).then(
    (resumo) => {
      setDados(resumo);
      setErro(null);
      setCarregando(false);
    },
    (e) => {
      if (signal?.aborted) return;
      setErro(e instanceof ApiError && e.status === 403 ? 'Esta conta não tem acesso ao painel.' : e instanceof Error ? e.message : 'Falha ao carregar.');
      setCarregando(false);
    },
  ), []);

  useEffect(() => {
    const ctrl = new AbortController();
    void carregar(dias, ctrl.signal);
    return () => ctrl.abort();
  }, [dias, carregar]);
  const recarregar = (janela = dias) => {
    setCarregando(true);
    if (janela === dias) void carregar(janela);
    else setDias(janela);
  };

  const k = dados?.kpis;
  const colunasGrafico = width >= 1100 ? 3 : width >= 720 ? 2 : 1;
  const itens = (dados?.feedback.itens ?? []).filter((i) => filtro === 'todos' || (filtro === 'comentario' ? !!i.comentario : i.tipo === filtro));
  const serie = (campo: 'perguntas' | 'usuarios' | 'latencia_media_ms') => (dados?.serie ?? []).map((d) => ({ chave: d.data, valor: d[campo] }));

  return (
    <ScrollView contentContainerStyle={{ alignSelf: 'center', width: '100%', maxWidth: 1200, padding: spacing.xl, gap: spacing.lg }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Pressable accessibilityLabel="Voltar" onPress={() => router.replace('/')} hitSlop={8}>
            <View style={{ transform: [{ rotate: '180deg' }] }}><Icone nome="seta" cor={colors.mutedForeground} /></View>
          </Pressable>
          <Texto v="titulo">Painel do USPapo</Texto>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.xs }}>
          {JANELAS.map((j) => (
            <Botao key={j} compacto v={dias === j ? 'primario' : 'secundario'} rotulo={j === 1 ? '24 h' : `${j} dias`} onPress={() => recarregar(j)} />
          ))}
          <Botao compacto v="secundario" icone="atualizar" rotulo="Atualizar" onPress={() => recarregar()} />
        </View>
      </View>

      {erro ? <Estado titulo="Não consegui carregar as métricas" mensagem={erro} acao="Tentar de novo" aoAgir={() => recarregar()} /> : null}
      {carregando && !dados ? <ActivityIndicator color={colors.brand} style={{ marginTop: spacing['3xl'] }} /> : null}

      {k && dados ? (
        <View style={{ gap: spacing.lg, opacity: carregando ? 0.6 : 1 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
            <Kpi rotulo="Perguntas" valor={numero(k.perguntas)} detalhe={`${numero(k.respondidas)} respondidas · ${numero(k.pendentes)} pendentes`} />
            <Kpi rotulo="Usuários ativos" valor={numero(k.usuarios)} detalhe={`${k.dau} nas últimas 24 h · ${k.wau} em 7 dias`} />
            <Kpi rotulo="Tempo de resposta" valor={duracao(k.latencia_media_ms)} detalhe={`p95 ${duracao(k.latencia_p95_ms)}`} />
            <Kpi rotulo="Taxa de sucesso" valor={porcento(k.taxa_sucesso)} detalhe={`${numero(k.erros)} falhas de provedor`} />
            <Kpi rotulo="Tokens" valor={numero(k.tokens)} detalhe={`${numero(k.conversas)} conversas novas`} />
            <Kpi rotulo="Satisfação" valor={porcento(k.satisfacao)} detalhe={`${k.likes} úteis · ${k.dislikes} não úteis · cobertura ${porcento(k.cobertura)}`} />
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
            {([['Perguntas por dia', 'perguntas', numero], ['Usuários ativos por dia', 'usuarios', numero],
              ['Tempo médio de resposta', 'latencia_media_ms', segundos]] as const).map(([titulo, campo, formatar]) => (
              <Cartao key={campo} style={{ flexBasis: `${100 / colunasGrafico - 2}%`, flexGrow: 1 }}>
                <Colunas titulo={titulo} dados={serie(campo)} formatar={formatar} rotuloX={diaCurto} />
              </Cartao>
            ))}
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
            <Cartao style={{ flexBasis: 300, flexGrow: 1 }}><Ranking titulo="Ferramentas usadas" itens={dados.ferramentas.map((f) => ({ nome: ferramenta(f.nome).rotulo, valor: f.contagem }))} /></Cartao>
            <Cartao style={{ flexBasis: 300, flexGrow: 1 }}><Ranking titulo="Fontes mais citadas" itens={dados.fontes.map((f) => ({ nome: f.fonte, valor: f.contagem }))} /></Cartao>
            <Cartao style={{ flexBasis: 300, flexGrow: 1 }}><Ranking titulo="Temas frequentes" itens={dados.temas.map((t) => ({ nome: t.tema, valor: t.contagem }))} /></Cartao>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
            <Cartao titulo="Provedores de LLM" style={{ flexBasis: 480, flexGrow: 1 }}>
              <Tabela colunas={['Provedor', 'Chamadas', 'Falhas', '% falha', 'Tempo', 'Tokens']}
                linhas={dados.provedores.map((p) => [p.nome, numero(p.chamadas), numero(p.erros), porcento(p.taxa_erro), duracao(p.latencia_media_ms), numero(p.tokens)])} />
            </Cartao>
            <Cartao titulo="Quem mais pergunta" style={{ flexBasis: 480, flexGrow: 1 }}>
              <Tabela colunas={['Usuário', 'Perguntas', 'Tokens', 'Última']}
                linhas={dados.top_usuarios.map((u) => [u.nome ?? u.id, numero(u.perguntas), numero(u.tokens), u.ultima ? diaCurto(u.ultima.slice(0, 10)) : '—'])} />
            </Cartao>
          </View>

          <Cartao titulo="Avaliações das respostas">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {FILTROS.map(([valor, rotulo]) => (
                <Botao key={valor} compacto v={filtro === valor ? 'primario' : 'secundario'} rotulo={rotulo} onPress={() => setFiltro(valor)} />
              ))}
            </View>
            {Object.keys(dados.feedback.por_motivo).length ? (
              <Texto v="legenda">Motivos: {Object.entries(dados.feedback.por_motivo).map(([m, n]) => `${m} (${n})`).join(' · ')}</Texto>
            ) : null}
            {itens.length ? itens.map((item, i) => <ItemAvaliacao key={item.id ?? i} item={item} />)
              : <Texto v="legenda">Nenhuma avaliação neste filtro.</Texto>}
          </Cartao>
        </View>
      ) : null}
    </ScrollView>
  );
}
