/**
 * The fetch used by the SSE chat stream.
 *
 * React Native's own `fetch` is the whatwg-fetch polyfill over
 * XMLHttpRequest: it has no `Response.body`, so the whole SSE payload is
 * buffered and only handed over once the request finishes. That is why the
 * app "had no streaming" on the phone — every answer landed in one piece,
 * after the model had finished writing it.
 *
 * `expo/fetch` is the WinterCG implementation the SDK ships; its
 * `Response.body` is a real ReadableStream, so `lib/api` sees the deltas as
 * they arrive. The web build keeps the platform fetch (the `.web` sibling),
 * which already streams.
 *
 * `configurarFetch` is the test seam — the same shape lib/cache uses for its
 * storage backend — so a unit test can script the wire byte by byte without
 * a native module in the way.
 */
import { fetch as expoFetch } from 'expo/fetch';

const PADRAO = expoFetch as unknown as typeof fetch;

let implementacao: typeof fetch = PADRAO;

/** Swaps the implementation (tests); `null` restores the default. */
export function configurarFetch(f: typeof fetch | null): void {
  implementacao = f ?? PADRAO;
}

export const fetchStream: typeof fetch = (input, init) =>
  implementacao(input as RequestInfo, init);
