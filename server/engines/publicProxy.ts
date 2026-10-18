import http from 'node:http';
import net from 'node:net';
import { once } from 'node:events';
import { parseTargetUrl, resolvePublicTarget } from '../security/target.js';
import { TRANSFER } from '../constants.js';
import { PROXY } from './constants.js';

/**
 * Provides media extractors with a loopback-only egress proxy that checks and pins every destination.
 * @returns {Promise<{url: string; close: () => void}>} Proxy endpoint and deterministic socket cleanup.
 */
export async function createPublicProxy(): Promise<{ url: string; close: () => void }> {
  const sockets = new Set<net.Socket>();
  const server = http.createServer(async (request, response) => {
    try {
      const target = parseTargetUrl(request.url);
      const destination = await resolvePublicTarget(target);
      if (target.protocol !== TRANSFER.http) {
        throw new Error('Use CONNECT for encrypted destinations.');
      }
      const upstream = http.request(
        target,
        {
          method: request.method,
          headers: { ...request.headers, host: target.host },
          agent: false,
          family: destination.family,
          lookup: (_hostname, _options, callback) => callback(null, destination.address, destination.family),
        },
        (source) => {
          response.writeHead(source.statusCode ?? PROXY.failure, source.headers);
          source.on('error', () => response.destroy());
          source.pipe(response);
        },
      );
      upstream.on('error', () => {
        response.destroy();
      });
      request.on('aborted', () => upstream.destroy());
      response.on('close', () => upstream.destroy());
      request.pipe(upstream);
    } catch {
      response.writeHead(PROXY.failure).end('Destination rejected.');
    }
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  server.on('connect', async (request, client, head) => {
    try {
      const target = parseTargetUrl(`https://${request.url ?? ''}`);
      const destination = await resolvePublicTarget(target);
      if (client.destroyed) {
        return;
      }
      const upstream = net.connect({
        host: destination.address,
        port: Number(target.port || TRANSFER.httpsPort),
        family: destination.family,
      });
      sockets.add(upstream);
      upstream.on('close', () => sockets.delete(upstream));
      upstream.on('error', () => client.destroy());
      client.on('error', () => upstream.destroy());
      client.on('close', () => upstream.destroy());
      upstream.once('connect', () => {
        client.write(PROXY.connected);
        if (head.length) {
          upstream.write(head);
        }
        upstream.pipe(client);
        client.pipe(upstream);
      });
    } catch {
      client.destroy();
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Unable to start the media connection.');
  }
  /** Releases listening and upstream sockets even when a download is cancelled. */
  function close(): void {
    server.close();
    for (const socket of sockets) {
      socket.destroy();
    }
  }
  return { url: `http://127.0.0.1:${address.port}`, close };
}
