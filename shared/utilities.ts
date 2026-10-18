export const UTILITY_STATUS = { idle: 'idle', waiting: 'waiting', updating: 'updating', failed: 'failed' } as const;
export const UTILITY = {
  path: '/api/utilities',
  intervalMilliseconds: 86_400_000,
  tickMilliseconds: 60_000,
  initialDelayMilliseconds: 120_000,
  commandTimeoutMilliseconds: 600_000,
  versionTimeoutMilliseconds: 10_000,
  maximumStateBytes: 32_768,
  maximumOutputBytes: 8_192,
  minimumFreeBytes: 1_073_741_824,
  maximumStagingBytes: 1_073_741_824,
  maximumVersionCharacters: 160,
} as const;
export const TOOL_COMMAND = { video: 'yt-dlp', instagram: 'gallery-dl', torrent: 'aria2c' } as const;
export type ToolId = keyof typeof TOOL_COMMAND;
export interface UtilitySnapshot {
  enabled: boolean;
  requested: boolean;
  status: (typeof UTILITY_STATUS)[keyof typeof UTILITY_STATUS];
  message: string;
  checkedAt: string | null;
  updatedAt: string | null;
  versions: Partial<Record<ToolId, string>>;
  usingManagedTools: boolean;
  canRollback?: boolean;
}

export const UTILITY_ACTION = {
  update: 'update',
  cancel: 'cancel',
  restore: 'restore',
  rollback: 'rollback',
  settings: 'settings',
} as const;
