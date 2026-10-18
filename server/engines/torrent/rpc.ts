import { randomBytes } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { HTTP_METHOD } from '../../../shared/contracts.js';
import { resolveUtility } from '../../utilities/resolve.js';
import { LIMIT } from '../../constants.js';
import { ENGINE_LIMIT } from '../constants.js';

/** aria2's per-transfer status is string encoded by its JSON-RPC protocol. */
export interface TorrentStatus {
  gid: string;
  status: 'active' | 'waiting' | 'paused' | 'error' | 'complete' | 'removed';
  totalLength: string;
  completedLength: string;
  downloadSpeed: string;
  connections: string;
  followedBy?: string[];
  bittorrent?: { info?: { name?: string } };
  errorMessage?: string;
}

/** Owns a private loopback aria2 instance; its RPC secret is fresh for every service process. */
export class TorrentRpc {
  private child: ChildProcess | undefined;
  private startup: Promise<void> | undefined;
  private readonly secret = randomBytes(ENGINE_LIMIT.secretBytes).toString('hex');

  /**
   * Binds engine state to the same persistent station volume.
   * @param {string} dataDirectory - Application state directory.
   * @param {NodeJS.ProcessEnv} [environment] - Existing service environment for managed native libraries.
   */
  constructor(
    private readonly dataDirectory: string,
    private readonly environment?: NodeJS.ProcessEnv,
  ) {}

  /**
   * Starts the engine once, and waits for authenticated RPC readiness instead of assuming a fixed delay.
   * @returns {Promise<void>} Engine ready for submissions.
   */
  start(): Promise<void> {
    this.startup ??= this.startEngine();
    return this.startup;
  }

  /**
   * Starts an unprivileged child that exits when its owning Node process disappears.
   * @returns {Promise<void>} Authenticated local readiness.
   */
  private async startEngine(): Promise<void> {
    const stateDirectory = path.join(this.dataDirectory, 'aria2');
    mkdirSync(stateDirectory, { recursive: true });
    const execution = resolveUtility('torrent', this.dataDirectory, this.environment);
    this.child = spawn(
      execution.command,
      [
        '--enable-rpc=true',
        '--rpc-listen-all=false',
        `--rpc-listen-port=${ENGINE_LIMIT.rpcPort}`,
        `--rpc-secret=${this.secret}`,
        `--rpc-max-request-size=${LIMIT.maximumBodyBytes}`,
        '--console-log-level=error',
        '--enable-color=false',
        '--summary-interval=0',
        `--max-concurrent-downloads=${LIMIT.maximumConcurrency}`,
        '--file-allocation=none',
        '--seed-time=0',
        '--bt-enable-lpd=false',
        '--follow-metalink=false',
        `--bt-stop-timeout=${ENGINE_LIMIT.secondsWithoutPeers}`,
        `--max-download-result=${ENGINE_LIMIT.maximumRpcResults}`,
        `--listen-port=${ENGINE_LIMIT.peerPort}`,
        `--dht-listen-port=${ENGINE_LIMIT.peerPort}`,
        `--dht-file-path=${path.join(stateDirectory, 'dht.dat')}`,
        `--dht-file-path6=${path.join(stateDirectory, 'dht6.dat')}`,
        `--stop-with-process=${process.pid}`,
      ],
      { stdio: 'ignore', env: execution.environment },
    );
    let failedToStart = false;
    const { child } = this;
    this.child.once('exit', () => {
      if (this.child === child) {
        this.startup = undefined;
      }
    });
    this.child.once('error', () => {
      failedToStart = true;
    });
    for (let attempt = 0; attempt < ENGINE_LIMIT.rpcStartupAttempts; attempt += 1) {
      if (failedToStart || this.child.exitCode !== null) {
        break;
      }
      try {
        await this.call('getVersion', []);
        return;
      } catch {
        await delay(ENGINE_LIMIT.rpcStartupDelayMilliseconds);
      }
    }
    this.stop();
    throw new Error('Torrent engine unavailable. Rebuild the Docker image and check that port 6800 is free.');
  }

  /**
   * Sends an authenticated bounded request only to this process's loopback engine.
   * @param {string} method - Fixed aria2 RPC operation selected by application code.
   * @param {unknown[]} parameters - Structured arguments, never shell command text.
   * @returns {Promise<T>} Validated RPC envelope result.
   */
  async call<T>(method: string, parameters: unknown[]): Promise<T> {
    const response = await fetch(`http://127.0.0.1:${ENGINE_LIMIT.rpcPort}/jsonrpc`, {
      method: HTTP_METHOD.post,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'linkdock',
        method: `aria2.${method}`,
        params: [`token:${this.secret}`, ...parameters],
      }),
      signal: AbortSignal.timeout(ENGINE_LIMIT.rpcTimeoutMilliseconds),
    });
    const envelope = (await response.json()) as { result?: T; error?: { message?: string } };
    if (!response.ok || envelope.error || envelope.result === undefined) {
      throw new Error(envelope.error?.message ?? 'The torrent engine did not respond.');
    }
    return envelope.result;
  }

  /** Stops and reaps the old executable before another managed version can bind its RPC port.
   * @returns {Promise<void>} Old process has closed, with forced termination after the grace interval.
   */
  async stopAndWait(): Promise<void> {
    const { child } = this;
    if (!child?.pid || child.exitCode !== null) {
      this.startup = undefined;
      return;
    }
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => child.kill('SIGKILL'), ENGINE_LIMIT.shutdownGraceMilliseconds);
      child.once('close', () => {
        clearTimeout(timeout);
        resolve();
      });
      child.kill('SIGTERM');
    });
    if (this.child === child) {
      this.child = undefined;
      this.startup = undefined;
    }
  }

  /** Stops the private engine along with peer connections; no RPC listener is published by Docker. */
  stop(): void {
    this.child?.kill('SIGTERM');
  }
}
