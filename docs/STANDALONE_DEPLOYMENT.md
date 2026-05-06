# Standalone Deployment — Run MUF Engine Without Our App Backend

**Audience.** Customers who want to integrate the MUF Engine SDK but
already have their own user database, billing, and auth. Standalone
mode lets you run just the WebRTC + chat services and bring your own
backend for everything else.

**What you skip.** The MUF App API (Python FastAPI). It handles
multi-tenant org validation, billing aggregation, and the AI policy
pipeline. If you have your own equivalents, you don't need ours.

**What you keep.** signaling-server (Rust), media-sfu (Node +
mediasoup), chat-engine (Node + Socket.io), Valkey (cache).

## How standalone mode is detected

Standalone mode activates automatically when **`APP_API_URL` is unset
or empty** in the signaling-server's environment. No flag needed; the
absence of an app URL signals "no app to validate against, run open".

Behavior changes when standalone:

| Endpoint | Tenant-aware mode | Standalone mode |
|---|---|---|
| `POST /create_room` | Requires `x-org-id` + `x-org-key` headers, validates against the App API | Headers optional; no validation; rooms created freely |
| `POST /broadcaster-token/:roomId` | Requires `x-org-id` + `x-org-key`; tenant isolation enforced | Headers optional; no tenant check |
| `GET /api/admin/live/rooms` | Requires `x-org-id` + `x-org-key`; returns only that org's rooms | Headers optional; returns all live rooms |
| `GET /viewer-token/:roomId` | Same in both modes — public endpoint, no tenant check |
| `GET /router-rtp-capabilities` | Same in both modes |
| `WS /ws` (Join) | Same in both modes — auth via JWT only |

The chat-engine and media-sfu have no equivalent toggle; they're
already app-agnostic. Just don't deploy the app container.

## Deploying

The repo's `docker-compose.yml` includes the app service. To run
standalone, comment it out and unset `APP_API_URL`:

```yaml
# docker-compose.standalone.yml — overlay with `docker compose -f docker-compose.yml -f docker-compose.standalone.yml up`
services:
  app:
    deploy:
      replicas: 0   # don't start
  signaling-server:
    environment:
      APP_API_URL: ""           # explicitly empty, triggers standalone mode
      APP_INTERNAL_SECRET: ""
```

Or just delete the `app:` service block from your compose file.

## JWT minting (your responsibility)

In standalone mode you mint your own JWTs against the same
`JWT_SECRET` the signaling-server uses. The token must carry these
claims (TypeScript-shaped, but applies to any JWT lib):

```ts
{
  room_id:         string,
  role:            'host' | 'viewer' | 'guest',
  room_type:       'live' | '1v1',
  display_name?:   string,    // your authenticated user's display name
  avatar_url?:     string,
  is_original_host?: boolean, // true for the room creator
  host_peer_id?:   string,    // L.9 audience anchor (see below)
  exp:             number,    // unix-seconds
}
```

For host tokens, generate a UUID for `host_peer_id` and use that same
value as the WebSocket Join's `peer_id`. The chat-engine partitions
chat + viewer count by `(room_id, host_peer_id)` so they MUST match.

For viewer tokens, set `host_peer_id` to the broadcaster's peer_id
(the one whose audience this viewer is joining). Falls back to the
room's first broadcaster if absent.

A minimal Node example:

```ts
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';

function mintHostToken(roomId: string, displayName: string) {
  const peerId = uuid();
  const token = jwt.sign({
    room_id:          roomId,
    role:             'host',
    room_type:        'live',
    display_name:     displayName,
    is_original_host: true,
    host_peer_id:     peerId,
    exp:              Math.floor(Date.now() / 1000) + 86400,
  }, process.env.JWT_SECRET);
  return { token, peerId };
}

function mintViewerToken(roomId: string, hostPeerId: string, displayName: string) {
  return jwt.sign({
    room_id:      roomId,
    role:         'viewer',
    room_type:    'live',
    display_name: displayName,
    host_peer_id: hostPeerId,
    exp:          Math.floor(Date.now() / 1000) + 3600,
  }, process.env.JWT_SECRET);
}
```

The same secret must be in the chat-engine's `JWT_SECRET` env so it
verifies tokens you minted.

## What you give up vs. running the App API

- **No org-level billing aggregation.** You track usage yourself.
- **No multi-tenant feature flags.** All rooms behave identically.
- **No AI policy pipeline.** If you need content moderation, you bring it.
- **No recording-completed webhook receiver.** The media-sfu posts to
  `${APP_API_URL}/internal/record-completed` when recordings finish;
  in standalone mode that endpoint doesn't exist, so recording metadata
  isn't persisted server-side. You can re-implement: receive the
  webhook in your own backend by setting `APP_API_URL` to your own
  URL (with `APP_INTERNAL_SECRET` matched), and handle the JSON body
  yourself. The signaling-server treats your backend as the App API
  for that one webhook only.

## What still works in standalone

- WebSocket signaling for create_room / join / produce / consume
- mediasoup transport + RTP routing
- Chat (Socket.io with per-host audience partitioning, L.9)
- Viewer count + presence
- Recording (R2 upload still happens; just no webhook receiver if no app)
- Cohost invitations + role upgrade (L.8a)

## Migration path: tenant-aware → standalone

If you start tenant-aware (with our app) and want to drop the app later:
1. Stop minting tokens with `x-org-id` headers — switch to direct JWT
   signing in your backend.
2. Unset `APP_API_URL` in the signaling-server env, restart.
3. Bring down the app container.
4. The signaling-server immediately stops calling validate-org and
   accepts headerless calls.

No data migration needed since the app's tables don't carry room
state — that lives in Valkey + memory.
