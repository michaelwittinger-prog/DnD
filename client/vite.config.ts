import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // IMPORTANT: Node.js v24+ defaults to IPv6 (::1) for "localhost".
    // Chrome tries IPv4 (127.0.0.1) first → ERR_CONNECTION_REFUSED.
    // Always bind explicitly to 127.0.0.1 to guarantee browser access.
    host: '127.0.0.1',
    proxy: {
      '/api': {
        // Use 127.0.0.1 instead of "localhost" — same IPv6 issue.
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
