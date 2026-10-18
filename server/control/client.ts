import { API_PATH, HTTP_METHOD, HTTP_STATUS, type DashboardSnapshot } from '../../shared/contracts.js';
import { CONTROL } from '../../shared/control.js';
import type { ServerConfig } from '../config.js';
import { CLI_HELP, parseCliArguments } from './cliArgs.js';

const JSON_INDENT = 2;
/**
 * Talks to the running server on loopback using the existing station credential, without a second queue process.
 * @param {ServerConfig} configuration - Environment configuration, never printed.
 * @param {string[]} args - Fixed command arguments.
 * @returns {Promise<string>} Safe command result for stdout.
 */
export async function runStationCommand(configuration: ServerConfig, args: string[]): Promise<string> {
  const command = parseCliArguments(args);
  if (!command) {
    return CLI_HELP;
  }
  const base = `http://127.0.0.1:${configuration.port}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Origin: configuration.publicOrigin ?? base,
  };
  const login = await fetch(`${base}${API_PATH.session}`, {
    method: HTTP_METHOD.post,
    headers,
    body: JSON.stringify({ token: configuration.accessToken }),
    signal: AbortSignal.timeout(CONTROL.requestTimeoutMilliseconds),
  });
  if (!login.ok) {
    throw new Error('Station authentication failed. Check the running container environment.');
  }
  const cookies = login.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
  if (!cookies) {
    throw new Error('Station did not return a session.');
  }
  try {
    const result = await fetch(`${base}${command.path}`, {
      method: command.method,
      headers: { ...headers, Cookie: cookies },
      ...(command.method === HTTP_METHOD.get ? {} : { body: JSON.stringify(command.body ?? {}) }),
      signal: AbortSignal.timeout(CONTROL.requestTimeoutMilliseconds),
    });
    if (result.status === HTTP_STATUS.noContent) {
      return 'Done.';
    }
    const payload: unknown = await result.json();
    if (!result.ok) {
      const error = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).error : null;
      throw new Error(typeof error === 'string' ? error : 'Station command failed.');
    }
    if (command.view) {
      const { jobs } = payload as DashboardSnapshot;
      if (command.view === 'files') {
        const job = jobs.find((item) => item.id === command.body);
        if (!job) {
          throw new Error('Download not found.');
        }
        return JSON.stringify(
          {
            id: job.id,
            status: job.status,
            torrentSelection: job.torrentSelection ?? null,
            destination: job.destination ?? null,
          },
          null,
          JSON_INDENT,
        );
      }
      return JSON.stringify(
        jobs.map((job) => ({
          id: job.id,
          status: job.status,
          filename: job.filename,
          stage: job.stage,
          destination: job.destination,
        })),
        null,
        JSON_INDENT,
      );
    }
    return JSON.stringify(payload, null, JSON_INDENT);
  } finally {
    await fetch(`${base}${API_PATH.session}`, {
      method: HTTP_METHOD.delete,
      headers: { ...headers, Cookie: cookies },
      body: '{}',
      signal: AbortSignal.timeout(CONTROL.requestTimeoutMilliseconds),
    }).catch(() => undefined);
  }
}
