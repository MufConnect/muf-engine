---
title: Quickstart
description: Host + viewer running in your browser in 10 minutes.
---

This guide gets you from zero to a working MUF Engine live stream in
about ten minutes. By the end you'll have:

- A self-hosted MUF Engine stack running locally via Docker
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
no clone needed, just install the SDK (`npm install @mufconnect/live-sdk`)
and point at our hosted endpoints. Skip to step 4 below; ignore steps 1-3.

Open `.env` and set the required secrets:

```bash
# Mandatory
JWT_SECRET=$(openssl rand -base64 48)
DB_PASSWORD=$(openssl rand -base64 32)
APP_INTERNAL_SECRET=$(openssl rand -base64 32)
SFU_INTERNAL_SECRET=$(openssl rand -base64 32)

# Optional but recommended for dev
LOG_LEVEL=DEBUG
MEDIA_ANNOUNCED_IP=127.0.0.1
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

You should see the application API, the signaling service, the media
service, the chat service, the database, and the cache — all
`running (healthy)`.

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

The stack is a small set of cooperating services, each with a single
responsibility:

```
┌──────────────────┐    WebSocket     ┌─────────────────────┐
│  Host browser    │ ───────────────► │  signaling service  │
│  (broadcaster.   │                  │  rooms, tokens,     │
│   html)          │ ◄─── HTTP ─────► │  session state      │
└──────────────────┘                  └─────────────────────┘
        │                                      │
        │ WebRTC                               │ internal
        ▼                                      ▼
┌──────────────────┐                  ┌─────────────────────┐
│   media service  │                  │  application API    │
│  routes audio +  │                  │  org validation     │
│  video (WebRTC)  │                  │  + recording        │
└──────────────────┘                  │  webhook            │
                                      └─────────────────────┘

┌──────────────────┐   real-time      ┌─────────────────────┐
│  Host browser    │   signaling      │   chat service      │
│                  │ ───────────────► │  chat + presence    │
└──────────────────┘                  └─────────────────────┘
```

- **Signaling service** mints session tokens, manages room state, and
  coordinates the media service.
- **Media service** routes video + audio between participants over
  WebRTC.
- **Chat service** handles real-time chat, presence, and viewer count.
- **Application API** validates organizations (multi-tenant) and
  persists policy + recording metadata.

In standalone mode (`APP_API_URL` unset), the application API is
optional — you bring your own backend.

## Next steps

- **[Concepts](/concepts/)** — what's a room, peer, audience? Read this before going further.
- **[Token minting](/guides/token-minting/)** — your backend signs JWTs that authorize broadcaster + viewer access. Examples in several common server languages.
- **[Slot system](/guides/slot-system/)** — plug your own widgets (Follow button, gift overlay, custom chat) into the prebuilt UI.

## Common issues

**Camera permission denied.** iOS Safari + Chrome require an
explicit user gesture (tap) before granting camera access. The first
tap on the page triggers the permission prompt — if it was denied
once, you'll need to re-grant via site settings.

**"Address already in use" on bring-up.** A previous Docker run left
a container holding a port. `docker compose down -v` to fully reset.

**Media service can't reach the announced IP.** For local dev, set
`MEDIA_ANNOUNCED_IP=127.0.0.1`. For production deployments behind
NAT, set this to your public IP and ensure the configured UDP media
port range is open.

**Camera works but no video on the viewer side.** The media service
may have restarted. `docker compose logs <media-service>` and look
for a worker-restart message. Usually fixed by
`docker compose restart <media-service>`.
