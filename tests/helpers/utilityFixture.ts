import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { savePrivateJson } from '../../server/notifications/store';
import { utilityIdentity, type ToolRelease } from '../../server/utilities/storage';
import { LIBRARY_TRIPLE } from '../../server/utilities/resolve';

/**
 * Creates real local executable fixtures without installing or contacting any external utility provider.
 * @param {string} directory - Station state directory.
 * @param {string} id - Candidate release UUID.
 * @param {string} version - Safe version string emitted by each fixture.
 * @returns {ToolRelease} Compatible persisted candidate metadata.
 */
export function createUtilityRelease(directory: string, id: string, version: string): ToolRelease {
  const root = path.join(directory, 'utilities', 'releases', id);
  const scripts = ['python/bin/yt-dlp', 'python/bin/gallery-dl', 'native/usr/bin/aria2c'];
  const program = `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(`${version}\n`)});\n`;
  for (const relative of scripts) {
    const filename = path.join(root, relative);
    mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
    writeFileSync(filename, program, { mode: 0o700 });
  }
  const triple = LIBRARY_TRIPLE[process.arch as keyof typeof LIBRARY_TRIPLE];
  mkdirSync(path.join(root, 'native/usr/lib', triple), { recursive: true });
  const release: ToolRelease = {
    id,
    identity: utilityIdentity(directory),
    versions: {
      video: version,
      instagram: version,
      torrent: version,
    },
  };
  savePrivateJson(path.join(root, 'release.json'), release);
  return release;
}
