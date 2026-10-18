import { describe, expect, it, vi } from 'vitest';
import { isPublicAddress, parseTargetUrl, resolvePublicTarget } from '../server/security/target';
import { getSafeFilename } from '../server/downloads/filename';
import type { LookupAddress } from 'node:dns';

const lookupMock = vi.hoisted(() => vi.fn<() => Promise<LookupAddress[]>>());

vi.mock('node:dns/promises', () => ({ lookup: lookupMock }));

/**
 * Groups behavior checks: public destination validation.
 */
describe('public destination validation', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '0.0.0.0',
    '100.64.0.1',
    '224.0.0.1',
    '192.0.2.1',
    '198.51.100.1',
    '203.0.113.1',
    '::1',
    '::',
    'fe80::1',
    'fc00::1',
    '::ffff:127.0.0.1',
    '2001:db8::1',
  ])(
    'blocks non-public address %s' /**
     * Verifies: blocks non-public address the supplied value.
     * @param {string} address - Address under test.
     */,
    (address) => {
      expect(isPublicAddress(address)).toBe(false);
    },
  );
  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])(
    'allows public address %s' /**
     * Verifies: allows public address the supplied value.
     * @param {string} address - Address under test.
     */,
    (address) => {
      expect(isPublicAddress(address)).toBe(true);
    },
  );
  it.each([
    'file:///etc/passwd',
    'ftp://example.com/file',
    'https://user:pass@example.com/file',
    'http://example.com:8080/file',
    'javascript:alert(1)',
    'not a url',
  ])(
    'rejects unsupported link %s' /**
     * Verifies: rejects unsupported link the supplied value.
     * @param {string} url - Link under test.
     */,
    (url) => {
      expect(() => parseTargetUrl(url)).toThrow();
    },
  );
  /**
   * Verifies: normalizes links and strips fragments.
   */
  it('normalizes links and strips fragments', () => {
    expect(parseTargetUrl('https://example.com/file#section').href).toBe('https://example.com/file');
  });
  /**
   * Verifies: blocks mixed public/private DNS answers instead of choosing the public answer.
   * @returns {Promise<void>} Completion of the asynchronous behavior.
   */
  it('blocks mixed public/private DNS answers instead of choosing the public answer', async () => {
    lookupMock.mockResolvedValueOnce([
      { address: '1.1.1.1', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ]);
    await expect(resolvePublicTarget(new URL('https://example.com/file'))).rejects.toThrow('blocked');
  });
  /**
   * Verifies: pins a checked result for the HTTP connection.
   * @returns {Promise<void>} Completion of the asynchronous behavior.
   */
  it('pins a checked result for the HTTP connection', async () => {
    const address = { address: '1.1.1.1', family: 4 };
    lookupMock.mockResolvedValueOnce([address]);
    await expect(resolvePublicTarget(new URL('https://example.com/file'))).resolves.toEqual(address);
  });
});

/**
 * Groups behavior checks: display filenames.
 */
describe('display filenames', () => {
  /**
   * Verifies: removes separators, path traversal and control characters.
   */
  it('removes separators, path traversal and control characters', () => {
    const filename = getSafeFilename(new URL('https://example.com/..%2Fsecret%00.zip'));
    expect(filename).not.toContain('/');
    expect(filename).not.toContain('\u0000');
    expect(filename.startsWith('.')).toBe(false);
  });
  /**
   * Verifies: handles malformed encoded names and empty paths.
   */
  it('handles malformed encoded names and empty paths', () => {
    expect(getSafeFilename(new URL('https://example.com/%XY'))).toBe('download');
    expect(getSafeFilename(new URL('https://example.com/'))).toBe('download');
  });
});
