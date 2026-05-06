import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite resolves @muf/core and @muf/meeting via npm workspace symlinks at the repo root.
// Override the signaling endpoint via env vars: VITE_SIGNALING_HOST, VITE_API_BASE_URL.
//
// `base` MUST match the URL prefix nginx serves the build from. Production deploys
// the built bundle at `/meeting/` so Vite hardcodes asset paths as
// `/meeting/assets/main.<hash>.js` — without this, index.html under /meeting/
// would request `/assets/main.<hash>.js` and 404 (white screen).
// Dev (`npm run dev`) still works because Vite serves at `127.0.0.1:5173/` with
// the same prefix locally.
export default defineConfig({
    base:    '/meeting/',
    plugins: [react()],
    server:  { port: 5173, host: '127.0.0.1' },
});
