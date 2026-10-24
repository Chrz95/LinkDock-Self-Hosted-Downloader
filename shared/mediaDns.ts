/** Explicit media-only resolver choice; the default preserves operating-system DNS. */
export const MEDIA_DNS_MODE = { system: 'system', cloudflare: 'cloudflare' } as const;
export type MediaDnsMode = (typeof MEDIA_DNS_MODE)[keyof typeof MEDIA_DNS_MODE];
