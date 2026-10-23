import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { ZipFile } from 'yazl';

const files = ['manifest.json', 'popup.html', 'popup.css', 'popup.js', 'transfer.js', 'README.md'];
const archive = new ZipFile();
for (const filename of files) {
  archive.addFile(`browser-connector/${filename}`, filename);
}
archive.end();
await pipeline(archive.outputStream, createWriteStream('public/linkdock-browser-connector.zip'));
