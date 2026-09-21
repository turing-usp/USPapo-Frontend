/**
 * Web: the browser's own fetch already streams (`Response.body`).
 *
 * Read from `globalThis` at CALL time, not at import time, so a test (or a
 * polyfill installed later) still gets picked up. See the native sibling for
 * why this seam exists at all.
 */
let implementacao: typeof fetch | null = null;

/** Swaps the implementation (tests); `null` restores the platform fetch. */
export function configurarFetch(f: typeof fetch | null): void {
  implementacao = f;
}

export const fetchStream: typeof fetch = (input, init) =>
  (implementacao ?? globalThis.fetch)(input as RequestInfo, init);
