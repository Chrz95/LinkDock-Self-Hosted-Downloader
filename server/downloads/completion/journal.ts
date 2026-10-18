import { constants, closeSync, fsyncSync, openSync, readFileSync, renameSync, fstatSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { DownloadArtifact } from '../../../shared/sources.js';

export const MOVE = {
  journal: '.linkdock-move.json',
  incoming: '.incoming',
  files: 'files',
  maximumJournalBytes: 33_554_432,
  fileMode: 0o600,
  directoryMode: 0o700,
} as const;
export interface MoveJournal {
  jobId: string;
  phase: 'copying' | 'prepared';
  files: DownloadArtifact[];
  hashes?: string[];
}
/**
 * Reads bounded no-follow ownership metadata, refusing unknown folders or changed manifests.
 * @param {string} directory - Existing job directory with checked ancestors.
 * @param {string} id - Expected job UUID.
 * @param {DownloadArtifact[]} [files] - Expected immutable source manifest.
 * @returns {MoveJournal} Owned journal, safe for recovery or removal.
 */
export function readJournal(directory: string, id: string, files?: DownloadArtifact[]): MoveJournal {
  const descriptor = openSync(path.join(directory, MOVE.journal), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const information = fstatSync(descriptor);
    if (!information.isFile() || information.size > MOVE.maximumJournalBytes) {
      throw new Error('Invalid move journal.');
    }
    const journal = JSON.parse(readFileSync(descriptor, 'utf8')) as MoveJournal;
    if (
      !journal ||
      journal.jobId !== id ||
      !['copying', 'prepared'].includes(journal.phase) ||
      !Array.isArray(journal.files) ||
      (files && JSON.stringify(journal.files) !== JSON.stringify(files)) ||
      (journal.phase === 'prepared' &&
        (!Array.isArray(journal.hashes) ||
          journal.hashes.length !== journal.files.length ||
          journal.hashes.some((hash) => typeof hash !== 'string' || !/^[a-f\d]{64}$/u.test(hash))))
    ) {
      throw new Error('Destination belongs to another transfer or has changed.');
    }
    return journal;
  } finally {
    closeSync(descriptor);
  }
}
/**
 * Flushes a complete ownership record before atomically replacing the journal.
 * @param {string} directory - Validated owned job directory.
 * @param {MoveJournal} journal - Source identity and optional prepared hashes.
 */
export function writeJournal(directory: string, journal: MoveJournal): void {
  const filename = path.join(directory, MOVE.journal);
  const temporary = `${filename}.tmp`;
  const descriptor = openSync(
    temporary,
    constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW,
    MOVE.fileMode,
  );
  try {
    writeFileSync(descriptor, JSON.stringify(journal));
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  renameSync(temporary, filename);
}
