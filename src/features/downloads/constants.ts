/** Poll frequency balances live feedback with low idle CPU use on a Raspberry Pi. */
export const POLL_INTERVAL_MILLISECONDS = 1_500;
/** Arithmetic units for human-readable progress. */
export const DISPLAY = { binaryBase: 1_024, percent: 100, fractionDigits: 1, secondsPerMinute: 60 } as const;
/** Stable filter IDs, their labels and matching transfer states. */
export const DOWNLOAD_FILTERS = [
  { id: 'all', label: 'All downloads' },
  { id: 'active', label: 'In progress' },
  { id: 'completed', label: 'Completed' },
  { id: 'failed', label: 'Needs attention' },
] as const;
/** Supported views of a queue. */
export type DownloadFilter = (typeof DOWNLOAD_FILTERS)[number]['id'];
/** Text repeated across transfer UI components. */
export const STATUS_LABEL = {
  queued: 'Queued',
  paused: 'Paused',
  downloading: 'Downloading',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
} as const;
/** Lifecycle labels reused by action names and tooltips. */
export const ACTION_LABEL = { pause: 'Pause', resume: 'Resume', retry: 'Restart', cancel: 'Cancel' } as const;
/** Empty states explain what each filter includes. */
export const EMPTY_MESSAGE = {
  all: 'Your next download starts here.',
  active: 'Nothing downloading right now.',
  completed: 'Completed files will land here.',
  failed: 'Everything is looking good.',
} as const;
