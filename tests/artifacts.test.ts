import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { listArtifacts, resolveArtifactPath } from '../server/engines/artifacts';
import { createPublicProxy } from '../server/engines/publicProxy';
import http from 'node:http';

const directories: string[] = [];
const REJECTED_DESTINATION_STATUS = 502;
afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe('published artifact boundaries', () => {
  it('collects nested regular files while excluding engine bookkeeping', async () => {
    const root = await mkdtemp(path.resolve('tests/.artifacts-'));
    directories.push(root);
    await mkdir(path.join(root, 'album'));
    await writeFile(path.join(root, 'album', 'photo.jpg'), 'photo');
    await writeFile(path.join(root, 'video.mp4'), 'video');
    await writeFile(path.join(root, 'video.mp4.aria2'), 'state');
    await writeFile(path.join(root, 'video.mp4.part-Frag1'), 'fragment');
    await writeFile(path.join(root, 'video.temp.mkv'), 'unfinished merge');
    await writeFile(path.join(root, 'video [id].f137.mp4'), 'intermediate stream');
    const artifacts = await listArtifacts(root);
    expect(artifacts.map((file) => file.relativePath)).toEqual(['album/photo.jpg', 'video.mp4']);
    await expect(resolveArtifactPath(root, 'album/photo.jpg')).resolves.toBe(path.join(root, 'album', 'photo.jpg'));
  });
  it('refuses symlinks and paths outside the owning job directory', async () => {
    const root = await mkdtemp(path.resolve('tests/.artifacts-'));
    directories.push(root);
    const output = path.join(root, 'output');
    await mkdir(output);
    await writeFile(path.join(root, 'private.txt'), 'not downloadable');
    await symlink(path.join(root, 'private.txt'), path.join(output, 'escape'));
    await expect(listArtifacts(output)).rejects.toThrow('Symbolic links');
    await expect(resolveArtifactPath(output, '../private.txt')).rejects.toThrow('outside');
    await expect(resolveArtifactPath(output, 'escape')).rejects.toThrow('outside');
  });
  it('rejects private HTTP destinations through the actual media proxy', async () => {
    const proxy = await createPublicProxy();
    try {
      const statusCode = await new Promise<number | undefined>((resolve, reject) => {
        const request = http.get(proxy.url, { path: 'http://127.0.0.1/private' }, (response) => {
          response.resume();
          resolve(response.statusCode);
        });
        request.on('error', reject);
      });
      expect(statusCode).toBe(REJECTED_DESTINATION_STATUS);
    } finally {
      proxy.close();
    }
  });
});
