/** Private account files are owner-only, including SQLite journals beneath the account directory. */
export const DEVIANTART_MODE = { directory: 0o700, file: 0o600 } as const;
export const ACCOUNT_ID = /^[a-f0-9-]{36}$/u;
