import { fileURLToPath } from 'node:url';

/** Bumps release compatibility when the required Python dependency profile changes. */
export const MEDIA_RUNTIME_PROFILE = 'yt-dlp-curl-cffi-v1';
export const MEDIA_RUNTIME_READY = 'LINKDOCK_MEDIA_BROWSER_READY_V1';
/** Single checker used by bundled image builds and candidate managed environments. */
export const MEDIA_RUNTIME_CHECK = fileURLToPath(new URL('./mediaRuntime.py', import.meta.url));
