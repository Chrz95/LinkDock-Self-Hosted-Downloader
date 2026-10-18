/** Resource limits and polling units for external download engines. */
export const ENGINE_LIMIT = {
  gidBytes: 8,
  maximumDirectoryDepth: 32,
  mediaRetryCount: 3,
  mediaSocketTimeoutSeconds: 30,
  maximumRpcResults: 1_000,
  secretBytes: 32,
  progressIntervalMilliseconds: 750,
  maximumTorrentBytes: 2_097_152,
  maximumFiles: 2_000,
  shutdownGraceMilliseconds: 3_000,
  maximumErrorCharacters: 8_192,
  rpcTimeoutMilliseconds: 5_000,
  rpcStartupAttempts: 40,
  rpcStartupDelayMilliseconds: 150,
  rpcPort: 6_800,
  peerPort: 6_881,
  secondsWithoutPeers: 300,
  stagingSpaceMultiplier: 2,
} as const;
/** All subprocess executables are fixed by the application, never supplied by request bodies. */
export const ENGINE_COMMAND = { video: 'yt-dlp', instagram: 'gallery-dl', torrent: 'aria2c' } as const;
/** Staged output is published only after successful worker completion. */
export const OUTPUT = {
  workingSuffix: '.work',
  metadataDirectory: 'torrents',
  outputSuffix: '.files',
  credentialsDirectory: 'credentials',
  credentialSessionPrefix: 'session-',
} as const;
/** Non-business HTTP details used by the media egress proxy. */
export const PROXY = { connected: 'HTTP/1.1 200 Connection Established\r\n\r\n', failure: 502 } as const;

/** Compact stdout protocol avoids parsing human output or buffering entire extractor metadata. */
export const MEDIA_LINE = { progress: 'LINKDOCK:', title: 'LINKDOCK_TITLE:' } as const;
