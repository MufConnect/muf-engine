---
title: Standalone deployment
description: Run MUF Engine without our App API backend — bring your own auth + billing.
---

If you have your own user database, billing system, and auth, you don't
need our FastAPI App API. Standalone mode runs just the WebRTC + chat
services — you mint your own JWTs and skip the multi-tenant org-validation layer.

## When to choose standalone

- You already have a backend with user accounts + billing.
- You want full control over rate limiting, abuse prevention, and access policy.
- You don't need our AI moderation pipeline.
- You're building a dedicated single-tenant product (one app, one customer base).

If any of those don't fit, run **tenant-aware mode** with our App API
included — it gives you the multi-tenant org boundary, billing
aggregation, and per-tenant feature flags out of the box.

## How standalone is detected

The signaling-server enters standalone mode automatically when the
`APP_API_URL` environment variable is unset or empty. No flag needed.

Behavior changes:

| Endpoint | Tenant-aware | Standalone |
|---|---|---|
| `POST /create_room` | Requires `x-org-id` + `x-org-key`, validates against App API | Headers optional, no validation |
| `POST /broadcaster-token/:roomId` | Requires headers + tenant isolation | Headers + tenant check skipped |
| `GET /api/admin/live/rooms` | Returns only that org's rooms | Returns all live rooms |
| `WS /ws` Join | JWT auth (same in both modes) | JWT auth (same in both modes) |

## Deploying standalone

Comment out the `app:` service from `docker-compose.yml` (or use a
compose overlay):

```yaml
# docker-compose.standalone.yml
services:
  app:
    deploy:
      replicas: 0
  signaling-server:
    environment:
      APP_API_URL:        ""
      APP_INTERNAL_SECRET: ""
```

Then:

```bash
docker compose -f docker-compose.yml -f docker-compose.standalone.yml up -d
```

## Mint tokens yourself

See the [Token minting guide](/guides/token-minting/) for the full
JWT shape. The same `JWT_SECRET` env var must be in:

- The signaling-server (validates incoming WS Joins)
- The chat-engine (validates Socket.io connections)
- Your token-mint backend (signs them)

## What you give up

- No org-level billing aggregation (track yourself)
- No AI policy pipeline (bring your own moderation)
- No recording webhook receiver — set `APP_API_URL` to your own URL
  with `APP_INTERNAL_SECRET` matched to receive recording-completed
  webhooks at your endpoint

## What still works

- All WebRTC signaling, mediasoup routing, recording uploads to R2
- Per-host chat partitioning (Phase L.9)
- Cohost invitations + role upgrades (Phase L.8a)
- Viewer count + presence
- The slot system + the prebuilt UI

## Migrating from tenant-aware to standalone

1. Switch your token-mint backend from calling the App API's
   `/create_room` to direct JWT signing. See [Token minting](/guides/token-minting/).
2. Unset `APP_API_URL` in the signaling-server's env. Restart.
3. Bring down the `app:` service.

No data migration — the App API's tables don't carry room state
(that lives in Valkey + memory).
