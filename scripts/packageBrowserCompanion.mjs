import { createWriteStream, readdirSync } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { ZipFile } from 'yazl';

/** Includes the complete authored companion, including all toolbar icon sizes.
 * @param {string} [directory] - Relative directory inside the standalone extension.
 * @returns {string[]} Sorted browser assets without symlinks or hidden files.
 */
function companionFiles(directory = '') {
  return readdirSync(path.join('browser-connector', directory), { withFileTypes: true })
    .flatMap((entry) => {
      const filename = path.join(directory, entry.name);
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) {
        return [];
      }
      return entry.isDirectory() ? companionFiles(filename) : [filename];
    })
    .sort();
}
const files = companionFiles();
const archive = new ZipFile();
for (const filename of files) {
  archive.addFile(`browser-connector/${filename}`, filename);
}
archive.end();
await pipeline(archive.outputStream, createWriteStream('public/linkdock-browser-connector.zip'));
