# MUF Engine — Sample Integration

Minimal full-stack integration showing how a customer's app uses the
MUF Engine SDK end-to-end:

- **Backend** (Node + Express): mints JWTs on demand from your
  authenticated user records.
- **Frontend** (Vite + React): host page + viewer page using
  `@muf/live-sdk` with TypeScript.

Together they demonstrate the standalone-deployment flow — your own
backend signs tokens against the shared `JWT_SECRET`, MUF Engine
services accept them.

## Architecture

```
┌────────────────┐  /api/host-token   ┌────────────────┐
│  React app     │ ──────────────────►│  Express API   │
│  (Vite, :5173) │                    │  (Node, :4000) │
└────────────────┘                    └────────────────┘
        │                                     │
        │ JWT (signed by                      │ JWT_SECRET
        │  your backend)                      │   matches signaling
        ▼                                     ▼
┌────────────────────────────────────────────────────────┐
│  MUF Engine self-hosted stack                          │
│  (signaling :3001, media-sfu :3002, chat :3003)        │
└────────────────────────────────────────────────────────┘
```

## Run it

### 1. Bring up MUF Engine

In a separate terminal, follow the [self-hosting quickstart](https://docs.mufconnect.com/guides/self-hosting/). The engine source is in a private repo — email **sales@mufconnect.com** for access. Once granted:

```bash
git clone https://github.com/MufConnect/muf-logic-engine
cd muf-logic-engine
cp .env.example .env
# Edit .env — set JWT_SECRET, POSTGRES_PASSWORD, MEDIASOUP_ANNOUNCED_IP=127.0.0.1
docker compose up -d
```

Note the `JWT_SECRET` value — you'll use it in the backend.

### 2. Run the backend

```bash
cd examples/sample-integration/backend
cp .env.example .env
# Edit .env — set JWT_SECRET to match the engine's
npm install
npm run dev
```

Backend now listening on `http://localhost:4000`.

### 3. Run the frontend

```bash
cd examples/sample-integration/frontend
npm install
npm run dev
```

Frontend at `http://localhost:5173`.

### 4. Try it

Open `http://localhost:5173` in your browser:
- Type a name, tap **Go LIVE** — broadcasts from your webcam
- Copy the share link, open in another tab — joins as viewer with chat

## What this demonstrates

- **Backend mints tokens, never the client.** The frontend never
  sees `JWT_SECRET`. It calls `/api/host-token` after authenticating
  the user (here mocked, in production replace with your auth).
- **Standalone mode.** No org credentials sent to the engine. The
  signaling-server runs with `APP_API_URL=""` (or any unset value).
- **Per-host audience partitioning (L.9).** The host token's
  `host_peer_id` is server-generated; the share link includes it as
  `?host=PEER_ID`; viewers route to the right audience automatically.
- **TypeScript end-to-end.** Token shapes typed via the SDK's exports.

## What this does NOT demonstrate

- A real auth system. The backend treats every request as
  authenticated. Replace with your own session / OAuth / API key
  middleware.
- Cohost invite UI. The host's "Allow guests" toggle works but the
  full invite-active-viewer flow is in the prebuilt broadcaster.html;
  customers building their own UI should reference
  [the slot system guide](https://docs.mufconnect.com/guides/slot-system/).
- Recording. The SDK supports it; this sample doesn't wire the UI.
- Multi-tenant orgs. This sample assumes one customer, one app.

## Next steps

- **For a quick eval**: just run this sample — it's the fastest way to
  see end-to-end token-mint → broadcast → viewer.
- **For a production integration**: copy `backend/` into your existing
  Express / Fastify / Next.js API and adapt the auth middleware. Copy
  `frontend/src/MufStream.tsx` into your React tree.
- **Different backend stack**: see the
  [token-minting guide](https://docs.mufconnect.com/guides/token-minting/)
  for Python (FastAPI) and Go examples.
