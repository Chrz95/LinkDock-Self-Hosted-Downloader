import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { LIBRARY_TRIPLE } from './resolve.js';
import { runUtilityCommand } from './process.js';
import { verifyDependencies } from './dependencies.js';

const NATIVE_PACKAGES = ['aria2', 'libaria2-0'];
/**
 * Downloads authenticated candidates from the image's signed APT repositories without a system installation.
 * @param {string} root - Private candidate release.
 * @param {string} utilities - Persistent signed-index cache root.
 * @param {AbortSignal} signal - Owner/shutdown cancellation.
 * @param {NodeJS.ProcessEnv} [environment] - Service environment and candidate-private temporary directory.
 * @returns {Promise<void>} Compatible aria2 and libaria2 extracted beneath the candidate.
 */
export async function prepareNativeTools(
  root: string,
  utilities: string,
  signal: AbortSignal,
  environment?: NodeJS.ProcessEnv,
): Promise<void> {
  if (process.platform !== 'linux' || !LIBRARY_TRIPLE[process.arch as keyof typeof LIBRARY_TRIPLE]) {
    throw new Error('Managed aria2 updates require the Debian Linux ARM64/AMD64 image.');
  }
  const apt = path.join(utilities, 'apt');
  const downloads = path.join(root, 'packages');
  for (const folder of ['lists/partial', 'cache/archives/partial', 'log']) {
    mkdirSync(path.join(apt, folder), { recursive: true, mode: 0o700 });
  }
  mkdirSync(downloads, { mode: 0o700 });
  const options = [
    '-o',
    `Dir::State::lists=${path.join(apt, 'lists')}`,
    '-o',
    `Dir::Cache=${path.join(apt, 'cache')}`,
    '-o',
    `Dir::Log=${path.join(apt, 'log')}`,
    '-o',
    'Debug::NoLocking=true',
    '-o',
    'APT::Sandbox::User=',
    '-o',
    'APT::Update::Error-Mode=any',
    '-o',
    'Acquire::Languages=none',
    '-o',
    'Acquire::http::Timeout=30',
    '-o',
    'Acquire::https::Timeout=30',
    '-o',
    'Acquire::AllowInsecureRepositories=false',
    '-o',
    'APT::Get::AllowUnauthenticated=false',
  ];
  await runUtilityCommand('apt-get', [...options, 'update'], downloads, signal, environment);
  await runUtilityCommand('apt-get', [...options, 'download', ...NATIVE_PACKAGES], downloads, signal, environment);
  const packages = readdirSync(downloads).filter((filename) => filename.endsWith('.deb'));
  if (packages.length !== NATIVE_PACKAGES.length) {
    throw new Error('Unexpected native package set.');
  }
  const staged = new Map<string, string>();
  const metadata: { filename: string; dependencies: string }[] = [];
  for (const item of packages) {
    const filename = path.join(downloads, item);
    const name = await runUtilityCommand('dpkg-deb', ['--field', filename, 'Package'], downloads, signal, environment);
    const version = await runUtilityCommand(
      'dpkg-deb',
      ['--field', filename, 'Version'],
      downloads,
      signal,
      environment,
    );
    const architecture = await runUtilityCommand(
      'dpkg-deb',
      ['--field', filename, 'Architecture'],
      downloads,
      signal,
      environment,
    );
    const expectedArchitecture = process.arch === 'arm64' ? 'arm64' : 'amd64';
    if (
      !NATIVE_PACKAGES.includes(name) ||
      staged.has(name) ||
      architecture !== expectedArchitecture ||
      !/^[\w.+:~-]+$/u.test(version)
    ) {
      throw new Error('Unexpected native package identity.');
    }
    staged.set(name, version);
    const dependencies = await runUtilityCommand(
      'dpkg-deb',
      ['--field', filename, 'Depends'],
      downloads,
      signal,
      environment,
    );
    const prerequisites = await runUtilityCommand(
      'dpkg-deb',
      ['--field', filename, 'Pre-Depends'],
      downloads,
      signal,
      environment,
    );
    metadata.push({ filename, dependencies: [dependencies, prerequisites].filter(Boolean).join(',') });
  }
  for (const item of metadata) {
    await verifyDependencies(item.dependencies, staged, downloads, signal, environment);
  }
  mkdirSync(path.join(root, 'native'), { mode: 0o700 });
  for (const item of metadata) {
    await runUtilityCommand(
      'dpkg-deb',
      ['--extract', item.filename, path.join(root, 'native')],
      downloads,
      signal,
      environment,
    );
  }
  rmSync(downloads, { recursive: true, force: true });
}
