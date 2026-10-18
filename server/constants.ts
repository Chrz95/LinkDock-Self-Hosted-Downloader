/** Operational units and limits, never scattered through transfer logic. */
export const LIMIT = {
  bytesPerGibibyte: 1_073_741_824,
  millisecondsPerSecond: 1_000,
  maximumRedirects: 5,
  idleTimeoutMilliseconds: 30_000,
  sessionLifetimeMilliseconds: 43_200_000,
  loginWindowMilliseconds: 900_000,
  loginAttempts: 10,
  minimumTokenLength: 32,
  maximumHistory: 500,
  maximumUrlLength: 8_192,
  maximumFilenameLength: 160,
  maximumConcurrency: 8,
  defaultConcurrency: 2,
  defaultFileGibibytes: 20,
  defaultPort: 8_080,
  maximumPort: 65_535,
  maximumBodyBytes: 3_145_728,
} as const;

/** Network and filesystem literals reused across download modules. */
export const TRANSFER = {
  http: 'http:',
  https: 'https:',
  httpPort: '80',
  httpsPort: '443',
  partialExtension: '.part',
  historyFile: 'history.json',
  downloadsDirectory: 'downloads',
  cancelledMessage: 'Cancelled by you.',
  genericFilename: 'download',
} as const;

/** Cookie name shared by session creation and validation. */
export const SESSION_COOKIE_NAME = 'linkdock_session';
