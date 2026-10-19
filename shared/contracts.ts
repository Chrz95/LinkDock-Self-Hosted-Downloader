import type { DownloadArtifact, SourceType, DownloadQuality } from './sources.js';

/** Stable transfer states shared by the service and interface. */
export const DOWNLOAD_STATUS = {
  queued: 'queued',
  paused: 'paused',
  downloading: 'downloading',
  completed: 'completed',
  failed: 'failed',
  cancelled: 'cancelled',
} as const;

/** Persisted state of one transfer; source links are visible only after authentication. */
export interface DownloadJob {
  id: string;
  url: string;
  filename: string;
  status: (typeof DOWNLOAD_STATUS)[keyof typeof DOWNLOAD_STATUS];
  receivedBytes: number;
  totalBytes: number | null;
  bytesPerSecond: number;
  createdAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
  mediaFailure?: import('./mediaFailures.js').MediaFailure;
  sourceType?: SourceType;
  quality?: DownloadQuality;
  deviantart?: import('./deviantart.js').DeviantartPreferences;
  files?: DownloadArtifact[];
  stage?: string;
  peers?: number;
  resumeValidator?: string;
  resumeSourceUrl?: string;
  priority?: import('./batch.js').JobPriority;
  library?: import('./library.js').LibraryMetadata;
  torrentSelection?: import('./jobOptions.js').TorrentSelection;
  destination?: import('./jobOptions.js').CompletionDestination;
  payloadReady?: boolean;
}

/** Live queue and filesystem snapshot. */
export interface DashboardSnapshot {
  jobs: DownloadJob[];
  storage: { availableBytes: number; totalBytes: number };
  concurrency: number;
  maximumFileBytes: number;
  policy?: import('./policy.js').PolicySnapshot;
}

/** One source of truth for browser and server URLs. */
export const API_PATH = {
  prefix: '/api',
  session: '/api/session',
  downloads: '/api/downloads',
  health: '/api/health',
  settings: '/api/settings',
  notifications: '/api/notifications',
  station: '/api/station',
} as const;

/** HTTP responses used by both runtime boundaries. */
export const HTTP_STATUS = {
  ok: 200,
  partialContent: 206,
  created: 201,
  noContent: 204,
  badRequest: 400,
  unauthorized: 401,
  forbidden: 403,
  notFound: 404,
  conflict: 409,
  unsupportedMediaType: 415,
  rangeNotSatisfiable: 416,
  tooManyRequests: 429,
  tooLarge: 413,
  serverError: 500,
} as const;

/** Mutations available on an existing transfer. */
export const JOB_ACTION = {
  retry: 'retry',
  cancel: 'cancel',
  pause: 'pause',
  resume: 'resume',
  priorityHigh: 'priority-high',
  priorityNormal: 'priority-normal',
  priorityLow: 'priority-low',
} as const;

/** Type of a supported job mutation. */
export type JobAction = (typeof JOB_ACTION)[keyof typeof JOB_ACTION];

/** Request verbs shared by the client, CSRF policy and transfer routes. */
export const HTTP_METHOD = { get: 'GET', head: 'HEAD', post: 'POST', delete: 'DELETE' } as const;

/** Download subpaths used by both the router and authenticated browser links. */
export const DOWNLOAD_PATH = {
  torrentUpload: '/torrent',
  file: '/file',
  files: '/files',
  batch: '/batch',
  batchPreview: '/batch-preview',
  organization: '/organization',
  preview: '/preview',
  archive: '/archive',
} as const;
