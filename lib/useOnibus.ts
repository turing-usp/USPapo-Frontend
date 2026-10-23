/** One current snapshot per bus query, shared by repeated cards in the conversation. */
import { useMemo, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';

import { buscarOnibus, type DadosDoOnibus } from './onibus';

type Estado = (
  | { tipo: 'carregando' | 'falhou' | 'sumiu' | 'pausado' }
  | { tipo: 'pronto'; dados: DadosDoOnibus }
) & { buscando: boolean };

const INICIAL: Estado = { tipo: 'carregando', buscando: false };
const FOTO_INICIAL: { estado: Estado; agora: number } = { estado: INICIAL, agora: 0 };
const TIQUE_MS = 15_000;
const INTERVALO_MS = 30_000;
const JANELA_MS = 15 * 60_000;
const consultas = new Map<string, Consulta>();
const ignorar = () => () => {};
const inicial = () => FOTO_INICIAL;
const lista = (valor = '') => [...new Set(valor.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))].sort().join(',');

class Consulta {
  private foto = FOTO_INICIAL;
  private ouvintes = new Set<() => void>();
  private intervalo?: ReturnType<typeof setInterval>;
  private pedido: Promise<void> | null = null;
  private controle?: AbortController;
  private geracao = 0;
  private ate = 0;
  private ultima = 0;

  constructor(private campos: Record<string, string>) {}

  ler = () => this.foto;
  private get estado() { return this.foto.estado; }
  get ativa() { return this.ouvintes.size > 0; }

  private publicar(estado: Estado) {
    this.foto = { estado, agora: Date.now() };
    this.ouvintes.forEach((ouvir) => ouvir());
  }

  assinar = (ouvir: () => void) => {
    this.ouvintes.add(ouvir);
    if (this.ouvintes.size === 1) {
      void this.atualizar();
      this.intervalo = setInterval(() => {
        if (Date.now() >= this.ate) {
          if (!this.pedido && this.estado.tipo !== 'pausado') this.publicar({ tipo: 'pausado', buscando: false });
          return;
        }
        const visivel = Platform.OS === 'web' ? typeof document === 'undefined' || document.visibilityState === 'visible'
          : AppState.currentState === 'active';
        if (visivel && Date.now() - this.ultima >= INTERVALO_MS) void this.buscar();
        else this.publicar(this.estado);
      }, TIQUE_MS);
    }
    return () => {
      this.ouvintes.delete(ouvir);
      if (this.ouvintes.size) return;
      clearInterval(this.intervalo);
      this.geracao++;
      this.controle?.abort();
      this.pedido = null;
      this.foto = FOTO_INICIAL;
    };
  };

  atualizar = () => {
    this.ate = Date.now() + JANELA_MS;
    return this.buscar();
  };

  private buscar(): Promise<void> {
    if (this.pedido) return this.pedido;
    if (!this.ativa) return Promise.resolve();
    const geracao = ++this.geracao;
    this.ultima = Date.now();
    const controle = new AbortController();
    this.controle = controle;
    this.publicar({ ...this.estado, buscando: true });
    this.pedido = (async () => {
      try {
        const dados = await buscarOnibus(this.campos, controle.signal);
        if (geracao !== this.geracao) return;
        this.publicar(dados ? { tipo: 'pronto', dados, buscando: false } : { tipo: 'sumiu', buscando: false });
      } catch {
        if (geracao === this.geracao) this.publicar({ tipo: 'falhou', buscando: false });
      } finally {
        if (geracao === this.geracao) this.pedido = null;
      }
    })();
    return this.pedido;
  }
}

export function useOnibus(campos: Record<string, string>, pronto: boolean) {
  const chave = JSON.stringify({ linhas: lista(campos.linhas), paradas: lista(campos.paradas) });
  const consulta = useMemo(() => {
    let atual = consultas.get(chave);
    if (!atual) {
      // Bound idle references without evicting a query another visible card uses.
      for (const [k, q] of consultas) if (consultas.size >= 128 && !q.ativa) consultas.delete(k);
      atual = new Consulta(JSON.parse(chave));
      consultas.set(chave, atual);
    }
    return atual;
  }, [chave]);
  const foto = useSyncExternalStore(pronto ? consulta.assinar : ignorar, pronto ? consulta.ler : inicial, inicial);
  return { ...foto, atualizar: consulta.atualizar };
}
