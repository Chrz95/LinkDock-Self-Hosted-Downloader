import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { COMPANION, COMPANION_TOKEN, EXTENSION_ORIGIN, type CompanionConnection } from '../../shared/companion.js';
import { safeDirectory } from '../downloads/completion/paths.js';
import { CONTROL_ID } from '../../shared/control.js';

interface SavedConnection extends CompanionConnection {
  extensionOrigin: string;
  hash: string;
  signature: string;
}
const DIGEST = /^[a-f\d]{64}$/u;
/** Persistent, bounded, independently revocable download-only credentials; cleartext tokens are returned once. */
export class CompanionStore {
  private readonly filename: string;
  /** Opens only private station storage and retains the password solely for credential revocation signatures.
   * @param {string} dataDirectory - Station state directory.
   * @param {string} secret - Existing station password; rotation invalidates every connection.
   */
  constructor(
    dataDirectory: string,
    private readonly secret: string,
  ) {
    this.filename = path.join(safeDirectory(path.join(dataDirectory, 'credentials'), true), 'companions.json');
  }
  /** Signs the credential identity and expiry, so changing the station password invalidates saved connections.
   * @param {SavedConnection} entry - Validated private record.
   * @returns {string} Fixed-length station-specific digest.
   */
  private signature(entry: SavedConnection): string {
    return createHmac('sha256', this.secret)
      .update(`companion-v1:${entry.id}:${entry.hash}:${entry.extensionOrigin}:${entry.expiresAt}`)
      .digest('hex');
  }
  /** Loads validated state without silently erasing corrupt or oversized registrations.
   * @returns {SavedConnection[]} Structurally valid saved records, including expired or invalidated ones.
   */
  private read(): SavedConnection[] {
    if (!existsSync(this.filename)) {
      return [];
    }
    try {
      const info = lstatSync(this.filename);
      if (!info.isFile() || info.isSymbolicLink() || info.size > COMPANION.maximumStateBytes) {
        throw new Error();
      }
      const entries: unknown = JSON.parse(readFileSync(this.filename, 'utf8'));
      if (
        !Array.isArray(entries) ||
        entries.length > COMPANION.maximumConnections ||
        entries.some(
          (entry) =>
            !entry ||
            typeof entry !== 'object' ||
            !CONTROL_ID.test(entry.id) ||
            typeof entry.extensionOrigin !== 'string' ||
            !EXTENSION_ORIGIN.test(entry.extensionOrigin) ||
            typeof entry.hash !== 'string' ||
            !DIGEST.test(entry.hash) ||
            typeof entry.signature !== 'string' ||
            !DIGEST.test(entry.signature) ||
            typeof entry.createdAt !== 'string' ||
            !Number.isFinite(Date.parse(entry.createdAt)) ||
            typeof entry.expiresAt !== 'string' ||
            !Number.isFinite(Date.parse(entry.expiresAt)),
        )
      ) {
        throw new Error();
      }
      return entries as SavedConnection[];
    } catch {
      throw new Error('Saved companion connections are unreadable. Restore the private station state from backup.');
    }
  }
  /** Filters expired and password-invalidated connections without exposing their private identity.
   * @returns {SavedConnection[]} Currently authorized credentials.
   */
  private current(): SavedConnection[] {
    return this.read().filter(
      (entry) =>
        Date.parse(entry.expiresAt) > Date.now() &&
        timingSafeEqual(Buffer.from(entry.signature, 'hex'), Buffer.from(this.signature(entry), 'hex')),
    );
  }
  /** Publishes private state atomically using a fresh, exclusive temporary file.
   * @param {SavedConnection[]} entries - Validated credential records.
   */
  private save(entries: SavedConnection[]): void {
    const temporary = `${this.filename}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify(entries), { mode: 0o600, flag: 'wx' });
      renameSync(temporary, this.filename);
    } finally {
      rmSync(temporary, { force: true });
    }
  }
  /** Lists only revocation identifiers and timestamps; no token, hash or extension identity is returned.
   * @returns {CompanionConnection[]} Public owner metadata.
   */
  list(): CompanionConnection[] {
    return this.current().map(({ id, createdAt, expiresAt }) => ({ id, createdAt, expiresAt }));
  }
  /** Creates one download-only credential following explicit station-session authorization.
   * @param {unknown} extensionOrigin - Exact Chromium extension origin, validated before signing.
   * @returns {object} Public metadata and a one-time cleartext bearer credential.
   */
  create(extensionOrigin: unknown) {
    if (typeof extensionOrigin !== 'string' || !EXTENSION_ORIGIN.test(extensionOrigin)) {
      throw new Error('Connect from the LinkDock browser companion.');
    }
    const entries = this.current();
    if (entries.length >= COMPANION.maximumConnections) {
      throw new Error('Companion connection limit reached. Revoke an old connection in Settings.');
    }
    const token = `ldc_${randomBytes(COMPANION.tokenBytes).toString('hex')}`;
    const entry: SavedConnection = {
      id: randomUUID(),
      extensionOrigin,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + COMPANION.lifetimeMilliseconds).toISOString(),
      hash: createHash('sha256').update(token).digest('hex'),
      signature: '',
    };
    entry.signature = this.signature(entry);
    this.save([...entries, entry]);
    return { connection: { id: entry.id, createdAt: entry.createdAt, expiresAt: entry.expiresAt }, token };
  }
  /** Validates bearer authority independently of browser cookies and binds it to the paired extension origin.
   * @param {unknown} token - Request credential, never logged or reflected.
   * @param {unknown} extensionOrigin - Extension identity supplied on its restricted client route.
   * @returns {CompanionConnection | undefined} Authorized connection or no authority.
   */
  authorize(token: unknown, extensionOrigin: unknown): CompanionConnection | undefined {
    if (typeof token !== 'string' || !COMPANION_TOKEN.test(token) || typeof extensionOrigin !== 'string') {
      return undefined;
    }
    const hash = createHash('sha256').update(token).digest();
    const entry = this.current().find(
      (candidate) =>
        candidate.extensionOrigin === extensionOrigin && timingSafeEqual(hash, Buffer.from(candidate.hash, 'hex')),
    );
    return entry && { id: entry.id, createdAt: entry.createdAt, expiresAt: entry.expiresAt };
  }
  /** Revokes one connection immediately without affecting station or provider sessions.
   * @param {string} id - Owner-selected or bearer-authorized connection identifier.
   */
  revoke(id: string): void {
    this.save(this.current().filter((entry) => entry.id !== id));
  }
}
