import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createApplication } from '../dist-server/server/app.js';
import { DownloadQueue } from '../dist-server/server/downloads/queue.js';
import { runStationCommand } from '../dist-server/server/control/client.js';
import { DOWNLOAD_STATUS } from '../dist-server/shared/contracts.js';

const WORKFLOW = { waitMilliseconds: 10, attempts: 100, futureMilliseconds: 60_000 };
/**
 * Exercises real compiled CLI authentication, durable scheduling, approved indexes and filesystem publication.
 * @param {object} configuration - Existing temporary smoke configuration.
 * @returns {Promise<void>} Compiled workflows verified without contacting a content source.
 */
export async function smokeWorkflows(configuration) {
  const settings = {
    ...configuration,
    dataDirectory: path.join(configuration.dataDirectory, 'workflows'),
    publicOrigin: 'https://station.example',
    secureCookie: true,
  };
  mkdirSync(settings.dataDirectory);
  const queue = new DownloadQueue(settings);
  let server;
  try {
    await queue.controls.command('pause', 'all');
    queue.updateSettings({ ...queue.policy.settings, completionDirectory: '.' });
    server = createApplication(settings, queue).listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    settings.port = server.address().port;
    const torrent = queue.addTorrent(Buffer.from('d4:infod4:name4:testee').toString('base64'), 'selection.torrent');
    assert.equal(torrent.destination.directory, '.');
    torrent.status = DOWNLOAD_STATUS.paused;
    torrent.torrentSelection = { files: [{ index: 1, name: 'chosen.bin', sizeBytes: 1 }] };
    queue.store.save();
    const files = JSON.parse(await runStationCommand(settings, ['files', torrent.id]));
    assert.equal(files.torrentSelection.files[0].index, 1);
    await runStationCommand(settings, ['select', torrent.id, '1']);
    assert.deepEqual(torrent.torrentSelection.selected, [1]);
    queue.cancel(torrent);
    queue.remove(torrent);
    const job = queue.add('https://example.com/saved.bin?secret=signed-source');
    assert.equal(job.destination.directory, '.');
    job.filename = 'saved.bin';
    job.status = DOWNLOAD_STATUS.completed;
    const bytes = Buffer.from('compiled completed output');
    job.receivedBytes = bytes.length;
    job.totalBytes = bytes.length;
    writeFileSync(queue.store.getFilePath(job.id), bytes);
    queue.store.save();
    const scheduled = JSON.parse(
      await runStationCommand(settings, [
        'pause',
        'all',
        '--at',
        new Date(Date.now() + WORKFLOW.futureMilliseconds).toISOString(),
      ]),
    );
    assert.equal(scheduled.task.status, 'pending');
    const schedules = JSON.parse(await runStationCommand(settings, ['schedules']));
    assert.equal(schedules.tasks.length, 1);
    await runStationCommand(settings, ['unschedule', scheduled.task.id]);
    await runStationCommand(settings, ['destination', job.id, 'Media/Smoke']);
    assert.equal(job.payloadReady, true);
    await runStationCommand(settings, ['resume', 'all']);
    for (let attempt = 0; attempt < WORKFLOW.attempts && job.status !== DOWNLOAD_STATUS.completed; attempt += 1) {
      await delay(WORKFLOW.waitMilliseconds);
    }
    assert.equal(job.status, DOWNLOAD_STATUS.completed);
    assert.equal(job.destination.moved, true);
    assert.deepEqual(readFileSync(path.join(queue.store.getOutputDirectory(job), 'saved.bin')), bytes);
    const listing = await runStationCommand(settings, ['list']);
    assert.ok(!listing.includes(settings.accessToken));
    assert.ok(!listing.includes('signed-source'));
    queue.remove(job);
    await queue.controls.command('pause', 'all');
    const automatic = queue.add('https://example.com/automatic.bin');
    automatic.filename = 'automatic.bin';
    automatic.receivedBytes = bytes.length;
    automatic.totalBytes = bytes.length;
    automatic.payloadReady = true;
    writeFileSync(queue.store.getFilePath(automatic.id), bytes);
    queue.store.save();
    await runStationCommand(settings, ['resume', 'all']);
    for (let attempt = 0; attempt < WORKFLOW.attempts && automatic.status !== DOWNLOAD_STATUS.completed; attempt += 1) {
      await delay(WORKFLOW.waitMilliseconds);
    }
    assert.equal(automatic.destination.moved, true);
    assert.deepEqual(
      readFileSync(path.join(queue.store.completedDirectory, automatic.id, 'files', 'automatic.bin')),
      bytes,
    );
    queue.remove(automatic);
    process.stdout.write('Compiled CLI, torrent selection, global completion default and overridden moves: passed.\n');
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await queue.stop();
  }
}
