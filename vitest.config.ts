import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/** Backend tests use Node; UI tests opt into jsdom with a file directive. */
export default defineConfig({
  plugins: [react()],
  test: { environment: 'node', setupFiles: [], restoreMocks: true, fileParallelism: false },
});
