/** Stable, non-secret diagnostic categories; extractor stderr never enters persisted download records. */
export const MEDIA_FAILURE = {
  format: 'format',
  verification: 'verification',
  login: 'login',
  access: 'access',
  rate: 'rate',
  region: 'region',
  unavailable: 'unavailable',
  drm: 'drm',
  network: 'network',
  utility: 'utility',
  unknown: 'unknown',
} as const;
export type MediaFailure = (typeof MEDIA_FAILURE)[keyof typeof MEDIA_FAILURE];
export const MEDIA_FAILURE_INFO = {
  format: {
    title: 'Requested quality unavailable',
    message: 'The source did not offer a matching media format.',
    guidance: 'Try Best available or a different quality under Download another version.',
    action: 'quality',
  },
  verification: {
    title: 'Browser verification required',
    message: 'This source needs browser verification.',
    guidance: 'Open the source in your browser, then import a verified site session in Settings and use Restart.',
    action: 'browser',
  },
  login: {
    title: 'Account session required',
    message: 'This source needs a valid account session.',
    guidance: 'Refresh site cookies in Settings. For DeviantArt, check its account token, then use Restart.',
    action: 'browser',
  },
  access: {
    title: 'Source denied access',
    message: 'The source refused this download request.',
    guidance: 'Check access in your browser. If a verified session is needed, refresh site cookies in Settings.',
    action: 'browser',
  },
  rate: {
    title: 'Source request limit',
    message: 'The source is limiting download requests.',
    guidance: 'Wait before restarting. Reduce concurrent requests or increase the video request delay in Settings.',
    action: 'settings',
  },
  region: {
    title: 'Regional restriction',
    message: 'The source reports that this media is unavailable in this region.',
    guidance: 'Check whether the original source is available from the station’s network.',
    action: 'source',
  },
  unavailable: {
    title: 'Media unavailable',
    message: 'The source reports that this media is unavailable or has been removed.',
    guidance: 'Check the original source link. Update the download utilities if the source still plays there.',
    action: 'tools',
  },
  drm: {
    title: 'Protected media',
    message: 'The source reports DRM-protected media.',
    guidance: 'These download tools cannot save this protected stream.',
    action: 'none',
  },
  network: {
    title: 'Source connection failed',
    message: 'The download engine could not connect to the source reliably.',
    guidance: 'Check the station’s network and source availability, then use Restart.',
    action: 'source',
  },
  utility: {
    title: 'Media utility unavailable',
    message: 'A required media utility or runtime is unavailable.',
    guidance:
      'Review Station health and utility updates in Settings. Bundled ffmpeg/runtime fixes need an image rebuild.',
    action: 'tools',
  },
  unknown: {
    title: 'Source extraction failed',
    message: 'The source could not be downloaded. Check the link, source availability and engine updates.',
    guidance: 'Review utility updates in Settings, or open the original source to check its availability.',
    action: 'tools',
  },
} as const;
