import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite proxy forwards /api/* to the local Express backend so the
// frontend can call /api/host-token without CORS in dev.
export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:4000',
                changeOrigin: true,
            },
        },
    },
});
