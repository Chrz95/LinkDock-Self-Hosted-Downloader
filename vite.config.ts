import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** Development keeps cookies and API calls on the frontend origin. */
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://127.0.0.1:8080' } },
  preview: { proxy: { '/api': 'http://127.0.0.1:8080' } },
});
