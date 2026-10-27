import { mkdtempSync, rmSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { DEFAULT_POLICY } from '../shared/policy';
import { PolicyStore, validatePolicy } from '../server/policy/settings';
import { isWindowOpen } from '../server/policy/schedule';
import { ensureStorage, StorageHoldError } from '../server/policy/storage';

const directories: string[] = [];
const PRIVATE_MODE = 0o600;
const PERMISSIONS_MASK = 0o777;
const RESERVED_BYTES = Number.MAX_SAFE_INTEGER;
afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

it.each([
  null,
  {},
  { ...DEFAULT_POLICY, reserveGib: -1 },
  { ...DEFAULT_POLICY, downloadKibPerSecond: 0.5 },
  { ...DEFAULT_POLICY, uploadKibPerSecond: Infinity },
  { ...DEFAULT_POLICY, reserveGib: '2' },
  { ...DEFAULT_POLICY, timeZone: 'Mars/Olympus' },
  { ...DEFAULT_POLICY, windowStart: '25:00' },
  { ...DEFAULT_POLICY, scheduleEnabled: 'true' },
  { ...DEFAULT_POLICY, scheduleEnabled: true, windowStart: '12:00', windowEnd: '12:00' },
])('rejects malformed policy before it affects active work: %j', (value) => {
  expect(() => validatePolicy(value)).toThrow();
});

it.each([
  ['2026-10-18T20:00:00Z', true],
  ['2026-10-19T03:59:00Z', true],
  ['2026-10-19T04:00:00Z', false],
  ['2026-10-18T19:59:00Z', false],
])('evaluates the Athens overnight window at %s', (instant, expected) => {
  expect(isWindowOpen({ ...DEFAULT_POLICY, scheduleEnabled: true }, new Date(instant))).toBe(expected);
});

it('honors same-day boundaries, disabled schedules and both occurrences of a DST hour', () => {
  const policy = { ...DEFAULT_POLICY, scheduleEnabled: true, windowStart: '03:00', windowEnd: '04:00' };
  expect(isWindowOpen(policy, new Date('2026-10-25T00:30:00Z'))).toBe(true);
  expect(isWindowOpen(policy, new Date('2026-10-25T01:30:00Z'))).toBe(true);
  expect(isWindowOpen(policy, new Date('2026-10-25T02:00:00Z'))).toBe(false);
  expect(isWindowOpen(DEFAULT_POLICY, new Date('2026-10-25T12:00:00Z'))).toBe(true);
});

it('persists owner-only settings atomically, restores them and rejects corrupt state', () => {
  const directory = mkdtempSync(path.resolve('tests/.policy-'));
  directories.push(directory);
  const store = new PolicyStore(directory);
  const configured = { ...DEFAULT_POLICY, downloadKibPerSecond: 1, reserveGib: 0 };
  store.update(configured);
  expect(new PolicyStore(directory).settings).toEqual(configured);
  const filename = path.join(directory, 'settings.json');
  expect(JSON.parse(readFileSync(filename, 'utf8'))).toEqual(configured);
  expect(statSync(filename).mode & PERMISSIONS_MASK).toBe(PRIVATE_MODE);
  expect(() => store.update({ ...configured, reserveGib: -1 })).toThrow();
  expect(store.settings).toEqual(configured);
  writeFileSync(filename, '{ invalid json');
  expect(() => new PolicyStore(directory)).toThrow();
});

it('distinguishes a temporary free-space hold from an ordinary source failure', () => {
  const directory = mkdtempSync(path.resolve('tests/.policy-'));
  directories.push(directory);
  expect(() => ensureStorage(directory, RESERVED_BYTES)).toThrow(StorageHoldError);
  expect(() => ensureStorage(directory, 0)).not.toThrow();
});

it('preserves a disabled retry preference when an older client submits settings without that field', () => {
  const directory = mkdtempSync(path.resolve('tests/.policy-'));
  directories.push(directory);
  const store = new PolicyStore(directory);
  store.update({ ...DEFAULT_POLICY, automaticRetries: false });
  const legacy = { ...DEFAULT_POLICY };
  delete legacy.automaticRetries;
  store.update(legacy);
  expect(store.settings.automaticRetries).toBe(false);
});
