import http from 'node:http';
import net from 'node:net';
import { once } from 'node:events';
import { parseTargetUrl, NonPublicTargetError } from '../security/target.js';
import { TRANSFER } from '../constants.js';
import { resolveMediaTarget, MediaDnsResolutionError } from '../security/mediaDns.js';
import type { MediaDnsMode } from '../../shared/mediaDns.js';
import { PROXY } from './constants.js';

export interface PublicProxyOptions {
  dnsMode?: MediaDnsMode;
  onRejection?: (reason: 'non-public-dns' | 'dns-unavailable') => void;
}
/**
 * Provides media extractors with a loopback-only egress proxy that checks and pins every destination.
 * @param {PublicProxyOptions} [options] - Explicit resolver choice and non-secret rejection feedback.
 * @returns {Promise<{url: string; close: () => void}>} Proxy endpoint and deterministic socket cleanup.
 */
export async function createPublicProxy(options: PublicProxyOptions = {}): Promise<{ url: string; close: () => void }> {
  /** Reports only recognized resolver failures; addresses and provider prose never reach the callback.
   * @param {unknown} error - Private connection setup error.
   */
  function reportRejection(error: unknown): void {
    if (error instanceof NonPublicTargetError) {
      options.onRejection?.('non-public-dns');
    } else if (error instanceof MediaDnsResolutionError) {
      options.onRejection?.('dns-unavailable');
    }
  }
  const sockets = new Set<net.Socket>();
  const server = http.createServer(async (request, response) => {
    try {
      const target = parseTargetUrl(request.url);
      const destination = await resolveMediaTarget(target, options.dnsMode);
      if (response.destroyed) {
        return;
      }
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
    } catch (error) {
      reportRejection(error);
      if (!response.destroyed) {
        response.writeHead(PROXY.failure).end('Destination rejected.');
      }
    }
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => socket.destroy());
  });
  server.on('connect', async (request, client, head) => {
    try {
      const target = parseTargetUrl(`https://${request.url ?? ''}`);
      const destination = await resolveMediaTarget(target, options.dnsMode);
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
    } catch (error) {
      reportRejection(error);
      if (!client.destroyed) {
        client.end('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
      }
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
