# MUF Engine

> WebRTC live streaming SDK — drop-in host / viewer / cohost flows for the web.

This is the **public docs + examples + support** repo for [MUF Engine](https://docs.mufconnect.com).

The engine source code lives in a private repo. This repo gives you everything you need to **integrate**, **self-host** (after we grant access), and **get help**.

## Get started

- **Quickstart**: [docs.mufconnect.com/quickstart](https://docs.mufconnect.com/quickstart/) — host + viewer running in 10 minutes.
- **Sample integration**: [examples/sample-integration/](./examples/sample-integration/) — minimal Express + Vite + React app showing token-mint → broadcast → viewer end to end.
- **Self-hosting**: [docs.mufconnect.com/guides/self-hosting](https://docs.mufconnect.com/guides/self-hosting/) — docker compose up on your VPS. Engine source available via private-repo invite (contact us).

## Get help

- **[Discussions](https://github.com/MufConnect/muf-engine/discussions)** — Q&A, bug reports, show-and-tell. First response within 1 business day during alpha.
- **Email** — security@mufconnect.com for sensitive issues (private vulnerability reports, license / billing questions).

## What's in this repo

`
docs-site/      — Astro + Starlight source for docs.mufconnect.com
examples/       — sample integrations (sample-integration/ = the canonical full-stack demo)
docs/           — additional reference docs (slot contract, standalone deployment guide)
`

The actual engine services (signaling-server in Rust, media-sfu in Node + mediasoup, chat-engine in Node + Socket.io, app in Python FastAPI) are in a private repo. Self-hosting customers get access via signed contract.

## License

Proprietary. © 2026 MUF Engine. All rights reserved. See [LICENSE.md](./LICENSE.md).

## What you can do with this repo

✅ Read the docs source, fork to suggest improvements.
✅ Use the sample integration code as a starting point for your own app — comments + identifiers from these examples are unrestricted.
✅ Open Discussions for help with integration.

## What you can't do (without a license)

❌ Run the engine services (signaling-server, media-sfu, etc.) commercially without a paid license.
❌ Re-distribute the engine source code (you don't have it; this repo doesn't include it).
❌ Reverse-engineer the JS SDK to reconstruct the server.

For commercial licensing, contact sales@mufconnect.com.
