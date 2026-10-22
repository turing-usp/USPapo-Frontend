/** Development only: the same /api forwarding that Vercel provides for the exported site. */
const http = require('node:http');
const https = require('node:https');

/** @typedef {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, next?: (error?: Error) => void) => unknown} Middleware */
/**
 * @param {Middleware} middleware
 * @param {string} backendUrl
 * @returns {Middleware}
 */
function withApiProxy(middleware, backendUrl) {
  const target = new URL(backendUrl);
  if (!['http:', 'https:'].includes(target.protocol)) throw new Error('EXPO_PUBLIC_BACKEND_URL must use HTTP or HTTPS.');
  const transport = target.protocol === 'https:' ? https : http;
  return function proxy(req, res, next = undefined) {
    if (!/^\/api(?:\/|\?|$)/.test(req.url ?? '')) return middleware(req, res, next);
    const incoming = new URL(req.url, 'http://localhost');
    const destination = new URL(target);
    destination.pathname = target.pathname.replace(/\/+$/, '') + incoming.pathname;
    destination.search = incoming.search;
    // Each request keeps its own bearer token. No browser cookies, Origin or fixed server credentials.
    const headers = {};
    for (const name of ['authorization', 'content-type', 'content-length', 'accept', 'x-admin-key']) {
      if (req.headers[name] !== undefined) headers[name] = req.headers[name];
    }
    const upstream = transport.request(destination, { method: req.method, headers }, (response) => {
      const responseHeaders = { ...response.headers };
      for (const name of ['connection', 'keep-alive', 'transfer-encoding', 'te', 'trailer', 'upgrade']) delete responseHeaders[name];
      res.writeHead(response.statusCode ?? 502, responseHeaders);
      response.on('error', () => res.destroy());
      response.pipe(res); // Stream chat frames immediately; never buffer a whole answer.
    });
    upstream.on('error', () => {
      if (res.destroyed) return;
      if (res.headersSent) { res.destroy(); return; }
      res.writeHead(502, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ erro: 'Não consegui acessar o backend configurado para o desenvolvimento. Confira EXPO_PUBLIC_BACKEND_URL e se o backend está disponível.' }));
    });
    req.on('aborted', () => upstream.destroy());
    req.on('error', () => upstream.destroy());
    res.on('close', () => { if (!res.writableEnded) upstream.destroy(); });
    req.pipe(upstream);
  };
}

module.exports = { withApiProxy };
