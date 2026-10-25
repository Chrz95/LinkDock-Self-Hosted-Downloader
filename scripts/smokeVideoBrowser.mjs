import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createPublicProxy } from '../dist-server/server/engines/publicProxy.js';
import { mediaEnvironment } from '../dist-server/server/engines/environment.js';
import { runEngineProcess } from '../dist-server/server/engines/runProcess.js';
import { readRuntimeEnvironment } from '../dist-server/server/config.js';

const [, , PYTHON] = process.argv;
if (!PYTHON) {
  throw new Error('Pass the Python executable from an environment with the media requirements installed.');
}
const CODE = String.raw`
import sys
from yt_dlp import YoutubeDL
from yt_dlp.networking import Request
from yt_dlp.networking.impersonate import ImpersonateTarget
with YoutubeDL({"quiet": True, "no_warnings": True, "cachedir": False, "proxy": sys.argv[1]}) as ydl:
    try:
        response = ydl.urlopen(Request(sys.argv[2], extensions={"impersonate": ImpersonateTarget(client="chrome")}))
        assert response.read() == b"fixture-file"
        print("IMPERSONATED_PROXY_OK")
    except Exception:
        if sys.argv[3] != "blocked":
            raise
        print("BLOCKED")
`;
const TIMEOUT = 15_000;
const REDIRECT = 302;
const BAD_GATEWAY = 502;
const sockets = new Set();
let privateHits = 0;
let forwarded = 0;
let connects = 0;
const guard = await createPublicProxy();
const origin = http.createServer((_request, response) => {
  privateHits += 1;
  response.end('fixture-file');
});
const front = http.createServer((request, response) => {
  const target = new URL(request.url);
  if (target.hostname === 'fixture.example') {
    if (target.pathname === '/ok') {
      response.end('fixture-file');
    } else {
      const destination =
        target.pathname === '/https'
          ? 'https://127.0.0.1/private'
          : `http://127.0.0.1:${origin.address().port}/private`;
      response.writeHead(REDIRECT, { Location: destination }).end();
    }
    return;
  }
  forwarded += 1;
  const upstream = http.get(guard.url, { path: request.url }, (source) => {
    response.writeHead(source.statusCode, source.headers);
    source.pipe(response);
  });
  upstream.on('error', () => response.destroy());
});
front.on('connect', (request, client) => {
  connects += 1;
  const upstream = http.request(guard.url, { method: 'CONNECT', path: request.url });
  upstream.on('connect', (response, socket) => {
    assert.equal(response.statusCode, BAD_GATEWAY);
    client.end('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n');
    socket.destroy();
  });
  upstream.on('error', () => client.destroy());
  upstream.end();
});
for (const server of [front, origin]) {
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('error', () => socket.destroy());
    socket.on('close', () => sockets.delete(socket));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
}
try {
  for (const route of ['ok', 'http', 'https']) {
    let result = '';
    await runEngineProcess(
      PYTHON,
      [
        '-c',
        CODE,
        `http://127.0.0.1:${front.address().port}`,
        `http://fixture.example/${route}`,
        route === 'ok' ? 'success' : 'blocked',
      ],
      AbortSignal.timeout(TIMEOUT),
      (line) => {
        result = line;
      },
      {
        env: mediaEnvironment({ ...readRuntimeEnvironment(), NO_PROXY: '127.0.0.1,localhost', no_proxy: '*' }),
      },
    );
    assert.equal(result, route === 'ok' ? 'IMPERSONATED_PROXY_OK' : 'BLOCKED');
  }
  assert.equal(privateHits, 0);
  assert.ok(forwarded > 0);
  assert.ok(connects > 0);
  process.stdout.write('Real curl_cffi browser requests, HTTP proxy and guarded cross-scheme redirects: passed.\n');
} finally {
  guard.close();
  for (const socket of sockets) {
    socket.destroy();
  }
  await Promise.all([front, origin].map((server) => new Promise((resolve) => server.close(resolve))));
}
