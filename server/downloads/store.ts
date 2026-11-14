import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DOWNLOAD_STATUS, type DownloadJob } from '../../shared/contracts.js';
import type { DownloadArtifact } from '../../shared/sources.js';
import { TRANSFER } from '../constants.js';
import { validateHistory } from './validateHistory.js';
import { destinationDirectory, destinationParent, safeDirectory } from './completion/paths.js';
import { ownsPublication, publicationPath, publicationStat } from './completion/publication.js';
import { resolveArtifactPath } from '../engines/artifacts.js';
import { OUTPUT } from '../engines/constants.js';
import { MOVE } from './completion/journal.js';

/** Disk-backed queue state, atomically replaced on lifecycle changes. */
export class DownloadStore {
  readonly jobs: DownloadJob[];
  readonly filesDirectory: string;
  readonly completedDirectory: string;
  private readonly historyPath: string;

  /**
   * Recovers persisted jobs; interrupted active transfers become eligible for automatic resumption.
   * @param {string} dataDirectory - Writable state volume.
   * @param {string} [completedDirectory] - Optional writable completion mount root.
   */
  constructor(
    readonly dataDirectory: string,
    completedDirectory?: string,
  ) {
    this.completedDirectory = path.resolve(completedDirectory ?? path.join(dataDirectory, 'completed'));
    this.filesDirectory = path.join(dataDirectory, TRANSFER.downloadsDirectory);
    mkdirSync(this.filesDirectory, { recursive: true });
    this.historyPath = path.join(dataDirectory, TRANSFER.historyFile);
    this.jobs = existsSync(this.historyPath) ? validateHistory(JSON.parse(readFileSync(this.historyPath, 'utf8'))) : [];
    for (const job of this.jobs) {
      if (job.status === DOWNLOAD_STATUS.downloading) {
        job.status = DOWNLOAD_STATUS.queued;
        job.bytesPerSecond = 0;
        job.errorMessage = null;
        job.mediaFailure = undefined;
        job.finishedAt = null;
        job.stage = 'Recovering after a station restart';
      }
    }
    this.save();
  }

  /** Atomically writes a coherent snapshot; an invalid history fails startup instead of erasing it. */
  save(): void {
    const temporaryPath = `${this.historyPath}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify(this.jobs), { mode: 0o600 });
    renameSync(temporaryPath, this.historyPath);
  }

  /**
   * Maps an internal UUID to a file inside the managed volume.
   * @param {string} jobId - Server-generated identifier.
   * @param {boolean} [isPartial] - Whether to address the in-progress file.
   * @returns {string} Absolute safe storage path.
   */
  getFilePath(jobId: string, isPartial = false): string {
    return path.join(this.filesDirectory, `${jobId}${isPartial ? TRANSFER.partialExtension : ''}`);
  }

  /**
   * Resolves published multi-file output, checking every destination ancestor on each delivery.
   * @param {DownloadJob} job - Validated existing job.
   * @returns {string} Managed published artifact root.
   */
  getOutputDirectory(job: DownloadJob): string {
    if (job.destination?.layout === 'shared' && job.destination.moved) {
      return destinationParent(this.completedDirectory, job);
    }
    return job.destination?.moved
      ? safeDirectory(path.join(destinationDirectory(this.completedDirectory, job), MOVE.files))
      : `${this.getFilePath(job.id)}${OUTPUT.outputSuffix}`;
  }

  /** Resolves one manifest entry and checks ownership in a shared destination.
   * @param {DownloadJob} job - Validated existing job.
   * @param {DownloadArtifact} file - Entry from the job's manifest.
   * @returns {Promise<string>} Checked published file path.
   */
  async getOutputFile(job: DownloadJob, file: DownloadArtifact): Promise<string> {
    const directory = this.getOutputDirectory(job);
    if (job.destination?.layout === 'shared' && job.destination.moved) {
      const filename = publicationPath(directory, file.relativePath);
      safeDirectory(path.dirname(filename));
      if (!ownsPublication(publicationStat(filename), file)) {
        throw new Error('This saved file is unavailable or has changed.');
      }
      return filename;
    }
    return resolveArtifactPath(directory, file.relativePath);
  }
}
