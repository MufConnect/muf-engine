// docs-site — Astro + Starlight
//
// Source of truth for the customer-facing docs at docs.mufconnect.com
// (or wherever the site is deployed). The content lives in
// src/content/docs/*.md and is rendered by Starlight's default theme.
//
// Local dev:    npm install && npm run dev    → http://localhost:4321
// Build:        npm run build                  → ./dist
// Deploy:       Cloudflare Pages picks up `dist` from the build output
//               via the `wrangler pages deploy` action (configured in
//               .github/workflows/docs-deploy.yml — TODO).

import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
    site: 'https://docs.mufconnect.com',
    integrations: [
        starlight({
            title: 'MUF Engine Docs',
            description: 'WebRTC live streaming SDK — drop-in host / viewer / cohost flows for the web.',
            social: {
                github: 'https://github.com/MufConnect/muf-engine',
            },
            editLink: {
                baseUrl: 'https://github.com/MufConnect/muf-engine/edit/main/docs-site/',
            },
            // Sidebar — explicit ordering (alphabetical default would put
            // Concepts before Quickstart; we want Quickstart first).
            sidebar: [
                {
                    label: 'Get started',
                    items: [
                        { label: 'Quickstart', slug: 'quickstart' },
                        { label: 'Concepts',   slug: 'concepts' },
                    ],
                },
                {
                    label: 'Guides',
                    items: [
                        { label: 'Token minting', slug: 'guides/token-minting' },
                        { label: 'Slot system',   slug: 'guides/slot-system' },
                    ],
                },
                {
                    label: 'API reference',
                    items: [
                        { label: 'MufLiveManager', slug: 'api/manager' },
                        { label: 'LiveEvent',      slug: 'api/events' },
                        { label: 'Slot names',     slug: 'api/slots' },
                    ],
                },
            ],
            customCss: ['./src/styles/custom.css'],
            head: [
                // Privacy-friendly analytics — wire in when ready (Plausible / Fathom / etc.)
            ],
        }),
    ],
});
