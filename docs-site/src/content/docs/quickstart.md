---
title: Quickstart
description: Host + viewer running in your browser in 10 minutes.
---

This guide gets you from zero to a working MUF Engine live stream in
about ten minutes. By the end you'll have:

- A self-hosted MUF Engine stack (signaling-server, media-sfu,
  chat-engine, app) running locally via Docker
- A host page broadcasting from your webcam
- A viewer page watching the broadcast
- Chat + viewer count working between them

You'll need: **Docker + Docker Compose**, **Node 18+**, a **modern
browser** (Chrome, Safari, Firefox latest), and a **webcam**.

## 1. Clone and configure

The engine source code is in a private repo. Self-hosting customers
get access via signed contract — email **sales@mufconnect.com** and
we'll add your GitHub user to the repo. Once you have access:

```bash
git clone https://github.com/MufConnect/muf-logic-engine
cd muf-logic-engine
cp .env.example .env
```

If you want to evaluate without self-hosting, use our managed service —
no clone needed, just install the SDK (`npm install @muf/live-sdk`)
and point at our hosted endpoints. Skip to step 4 below; ignore steps 1-3.

Open `.env` and set the required secrets:

```bash
# Mandatory
JWT_SECRET=$(openssl rand -base64 48)
POSTGRES_PASSWORD=$(openssl rand -base64 32)
APP_INTERNAL_SECRET=$(openssl rand -base64 32)
SFU_INTERNAL_SECRET=$(openssl rand -base64 32)

# Optional but recommended for dev
LOG_LEVEL=DEBUG
MEDIASOUP_ANNOUNCED_IP=127.0.0.1
```

## 2. Bring up the stack

```bash
docker compose up -d
```

First run takes ~3-4 minutes (downloading + building images). Subsequent
runs are seconds. Verify everything is up:

```bash
docker compose ps
```

You should see `muf-app`, `muf-signaling`, `muf-mediasoup`, `muf-chat`,
`muf-postgres`, `muf-valkey` — all `running (healthy)`.

If anything's red, check logs: `docker compose logs -f <service-name>`.

## 3. Open the host page

In your browser, go to:

```
http://localhost:8080/package-livestream/broadcaster.html
```

You'll see the pre-live setup screen. Type your name in the form
field, allow camera access when prompted, then tap **Go LIVE**.

Three things happen in sequence:
1. Camera preview shows your face (mirrored selfie-style)
2. 3-2-1 countdown over the preview
3. Live state — host pill top-left, viewer count + END button
   top-right, chat overlay bottom-left

## 4. Open a viewer

Tap the **Share** icon (bottom-right). It copies a viewer URL that
looks like:

```
http://localhost:8080/package-livestream/viewer.html?room=<UUID>&host=<PEER_ID>
```

Open that URL in another browser tab (or another device on the same
LAN). Type a viewer name and tap **Save**.

The viewer should now see the broadcaster's video. Type a chat message
in the viewer's input — it appears on the host's chat overlay.

## What's actually running

```
┌──────────────────┐     WebSocket    ┌─────────────────┐
│  Host browser    │ ───────────────► │ signaling-server│
│  (broadcaster.   │                  │  (Rust, :3001)  │
│   html)          │ ◄─── HTTP ─────► │                 │
└──────────────────┘                  └─────────────────┘
        │                                     │
        │ WebRTC                              │ HTTP
        ▼                                     ▼
┌──────────────────┐                  ┌─────────────────┐
│   media-sfu      │                  │   app (FastAPI) │
│  (mediasoup,     │                  │  org validation │
│   :3002)         │                  │  + recording    │
└──────────────────┘                  │  webhook        │
                                      └─────────────────┘

┌──────────────────┐     Socket.io    ┌─────────────────┐
│  Host browser    │ ───────────────► │  chat-engine    │
│                  │                  │  (Node, :3003)  │
└──────────────────┘                  └─────────────────┘
```

- **signaling-server** mints JWTs, manages room state, proxies to mediasoup.
- **media-sfu** routes video + audio between peers (WebRTC SFU).
- **chat-engine** handles real-time chat + presence + viewer count.
- **app** validates orgs (multi-tenant) + persists policy + recording metadata.

In standalone mode (`APP_API_URL` unset), the app is optional —
you bring your own backend. See [Standalone deployment](/guides/standalone-deployment/).

## Next steps

- **[Concepts](/concepts/)** — what's a room, peer, audience? Read this before going further.
- **[Token minting](/guides/token-minting/)** — your backend signs JWTs that authorize broadcaster + viewer access. Examples in Node, Python, Go.
- **[Slot system](/guides/slot-system/)** — plug your own widgets (Follow button, gift overlay, custom chat) into the prebuilt UI.
- **[Migration from Agora](/migration/from-agora/)** — concept-mapping table if you're porting from a different CPaaS.

## Common issues

**Camera permission denied.** iOS Safari + Chrome require an
explicit user gesture (tap) before granting camera access. The first
tap on the page triggers the permission prompt — if it was denied
once, you'll need to re-grant via site settings.

**"Address already in use" on bring-up.** A previous Docker run left
a container holding a port. `docker compose down -v` to fully reset.

**Mediasoup can't reach announced IP.** For local dev, set
`MEDIASOUP_ANNOUNCED_IP=127.0.0.1`. For production deployments behind
NAT, set this to your public IP and ensure UDP 10000-20000 is open.

**Camera works but no video on the viewer side.** The mediasoup-worker
container may have crashed. `docker compose logs media-sfu` and look
for "worker died." Usually fixed by `docker compose restart media-sfu`.
