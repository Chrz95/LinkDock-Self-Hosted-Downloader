import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createApplication } from '../dist-server/server/app.js';
import { DownloadQueue } from '../dist-server/server/downloads/queue.js';
import { runStationCommand } from '../dist-server/server/control/client.js';
import { utilityIdentity } from '../dist-server/server/utilities/storage.js';
import { resolveUtility, LIBRARY_TRIPLE } from '../dist-server/server/utilities/resolve.js';
import { runUtilityCommand } from '../dist-server/server/utilities/process.js';
import { savePrivateJson } from '../dist-server/server/notifications/store.js';
import { mediaFormatArguments } from '../dist-server/server/engines/mediaFormat.js';
import { AUDIO_QUALITY } from '../dist-server/shared/sources.js';

const RELEASE = '05d38859-b5ef-4ef3-92cc-8459544746df';
/**
 * Verifies native compiled MP3 options, persistent quality, managed execution and private utility CLI controls.
 * @param {object} configuration - Parent isolated production smoke environment.
 * @returns {Promise<void>} Compiled behavior passed without installing packages or contacting providers.
 */
export async function smokeUtilities(configuration) {
  const settings = {
    ...configuration,
    dataDirectory: path.join(configuration.dataDirectory, 'utility-smoke'),
    autoUpdateTools: false,
    publicOrigin: 'https://station.example',
    secureCookie: true,
  };
  mkdirSync(settings.dataDirectory);
  const queue = new DownloadQueue(settings);
  let server;
  try {
    await queue.controls.command('pause', 'all');
    const job = queue.add('https://youtu.be/offline-smoke', 'video', AUDIO_QUALITY.balanced);
    assert.equal(job.quality, AUDIO_QUALITY.balanced);
    const saved = JSON.parse(readFileSync(path.join(settings.dataDirectory, 'history.json'), 'utf8'));
    assert.equal(saved[0].quality, AUDIO_QUALITY.balanced);
    const format = mediaFormatArguments(job.quality);
    assert.ok(format.includes('--extract-audio'));
    assert.ok(format.includes('192K'));
    queue.cancel(job);
    queue.remove(job);
    const root = path.join(queue.utilities.store.directory, 'releases', RELEASE);
    for (const relative of ['python/bin/yt-dlp', 'python/bin/gallery-dl', 'native/usr/bin/aria2c']) {
      const filename = path.join(root, relative);
      mkdirSync(path.dirname(filename), { recursive: true });
      writeFileSync(filename, `#!/usr/bin/env node\nprocess.stdout.write('compiled-fixture\\n');\n`, { mode: 0o700 });
    }
    mkdirSync(path.join(root, 'native/usr/lib', LIBRARY_TRIPLE[process.arch]), { recursive: true });
    const versions = { video: 'compiled-fixture', instagram: 'compiled-fixture', torrent: 'compiled-fixture' };
    savePrivateJson(path.join(root, 'release.json'), {
      id: RELEASE,
      identity: utilityIdentity(settings.dataDirectory),
      versions,
    });
    queue.utilities.store.save({ ...queue.utilities.store.state, current: RELEASE, versions });
    const execution = resolveUtility('video', settings.dataDirectory);
    assert.ok(execution.command.includes(RELEASE));
    assert.equal(
      await runUtilityCommand(execution.command, ['--version'], root, new AbortController().signal),
      'compiled-fixture',
    );
    server = createApplication(settings, queue).listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    settings.port = server.address().port;
    const state = JSON.parse(await runStationCommand(settings, ['updates']));
    assert.equal(state.usingManagedTools, true);
    assert.ok(!JSON.stringify(state).includes(settings.dataDirectory));
    await runStationCommand(settings, ['auto-updates', 'off']);
    await runStationCommand(settings, ['restore-tools']);
    assert.equal(resolveUtility('video', settings.dataDirectory).command, 'yt-dlp');
    assert.equal(queue.utilities.snapshot().enabled, false);
    process.stdout.write('Compiled MP3 quality, managed tools and authenticated update CLI: passed.\n');
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await queue.stop();
  }
}
