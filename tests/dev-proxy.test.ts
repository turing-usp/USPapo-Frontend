/// <reference types="node" />
import { createServer, request, type IncomingHttpHeaders, type Server } from 'node:http';

import { withApiProxy } from '../scripts/dev-proxy.cjs';

const servers: Server[] = [];
async function listen(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test server address.');
  return `http://127.0.0.1:${address.port}`;
}
function send(url: string, headers: Record<string, string> = {}, body?: string, onChunk?: (chunk: string) => void) {
  return new Promise<{ status: number; headers: IncomingHttpHeaders; body: string }>((resolve, reject) => {
    const req = request(url, { method: body ? 'POST' : 'GET', headers }, (response) => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => { text += chunk; onChunk?.(chunk); });
      response.on('end', () => resolve({ status: response.statusCode!, headers: response.headers, body: text }));
      response.on('error', reject);
    });
    req.on('error', reject);
    req.end(body);
  });
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
    if (!server.listening) { resolve(); return; }
    server.closeAllConnections();
    server.close(() => resolve());
  })));
});

test.each([200, 403])('forwards the window and session token, preserving HTTP %i from the backend', async (status) => {
  let received: { url?: string; headers: IncomingHttpHeaders } | undefined;
  const backend = await listen(createServer((req, res) => {
    received = { url: req.url, headers: req.headers };
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(status === 200 ? { data: { perguntas: 12 } } : { erro: 'Acesso não autorizado.' }));
  }));
  const frontend = await listen(createServer(withApiProxy((_req, res) => res.end('frontend'), backend)));
  const response = await send(`${frontend}/api/analytics/resumo?dias=90`, {
    authorization: 'Bearer test-session', origin: 'http://localhost:8081', cookie: 'unrelated=private',
  });
  expect(response.status).toBe(status);
  expect(received?.url).toBe('/api/analytics/resumo?dias=90');
  expect(received?.headers.authorization).toBe('Bearer test-session');
  expect(received?.headers.origin).toBeUndefined();
  expect(received?.headers.cookie).toBeUndefined();
  expect(JSON.parse(response.body)).toEqual(status === 200 ? { data: { perguntas: 12 } } : { erro: 'Acesso não autorizado.' });
});

test('keeps frontend paths with Metro', async () => {
  const frontend = await listen(createServer(withApiProxy((req, res) => res.end(`frontend:${req.url}`), 'http://127.0.0.1:1')));
  expect((await send(`${frontend}/analytics`)).body).toBe('frontend:/analytics');
  expect((await send(`${frontend}/apiary`)).body).toBe('frontend:/apiary');
});

test('forwards POST bodies and delivers the first SSE frame before the answer ends', async () => {
  let receivedBody = '';
  let finish = () => {};
  const backend = await listen(createServer((req, res) => {
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => { receivedBody += chunk; });
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      finish = () => res.end('data: {"type":"end"}\n\n');
      res.write(': ok\n\n');
    });
  }));
  const frontend = await listen(createServer(withApiProxy((_req, res) => res.end(), backend)));
  let first = '';
  const response = await send(`${frontend}/api/chat`, { 'content-type': 'application/json' }, '{"pergunta":"ação"}', (chunk) => {
    if (!first) { first = chunk; finish(); }
  });
  expect(receivedBody).toBe('{"pergunta":"ação"}');
  expect(first).toBe(': ok\n\n');
  expect(response.headers['content-type']).toBe('text/event-stream');
  expect(response.body).toContain('data: {"type":"end"}');
});

test('disconnecting the browser also closes the upstream stream', async () => {
  let disconnected = () => {};
  const closed = new Promise<void>((resolve) => { disconnected = resolve; });
  const backend = await listen(createServer((_req, res) => {
    res.on('close', disconnected);
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(': ok\n\n');
  }));
  const frontend = await listen(createServer(withApiProxy((_req, res) => res.end(), backend)));
  await new Promise<void>((resolve, reject) => {
    const client = request(`${frontend}/api/chat/retomar`, (response) => {
      response.once('data', () => { client.destroy(); resolve(); });
    });
    client.on('error', reject);
    client.end();
  });
  await closed;
});

test('an unavailable backend returns a readable 502 instead of a broken fetch', async () => {
  const offline = createServer();
  const target = await listen(offline);
  const frontend = await listen(createServer(withApiProxy((_req, res) => res.end(), target)));
  await new Promise<void>((resolve) => offline.close(() => resolve()));
  const response = await send(`${frontend}/api/analytics/resumo?dias=7`);
  expect(response.status).toBe(502);
  expect(JSON.parse(response.body).erro).toContain('EXPO_PUBLIC_BACKEND_URL');
});
