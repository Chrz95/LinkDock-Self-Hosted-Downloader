import { copyFileSync, mkdirSync } from 'node:fs';

// tsc preserves JavaScript module paths; copy the non-JavaScript runtime asset alongside that module.
mkdirSync('dist-server/server/utilities', { recursive: true });
copyFileSync('server/utilities/mediaRuntime.py', 'dist-server/server/utilities/mediaRuntime.py');
