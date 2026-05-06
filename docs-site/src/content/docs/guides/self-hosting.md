---
title: Self-hosting (Docker)
description: Run MUF Engine on your own VPS with one docker-compose up.
---

The fastest way to run MUF Engine in production is the bundled
`docker-compose.yml`. One command brings up all six services
(signaling-server, media-sfu, chat-engine, app, valkey, postgres).

## Requirements

- A Linux VPS with **≥2 vCPU, ≥4 GB RAM, ≥40 GB disk**. Minimum
  for a small production deployment (10 concurrent streams). Larger
  rooms or more streams scale by adding mediasoup workers.
- **Docker + Docker Compose** (Docker 24+, Compose v2).
- **A public IPv4** address. mediasoup announces this IP in ICE
  candidates; if your VPS is behind a reverse proxy / NAT layer,
  the announced IP must match the public-facing endpoint.
- **UDP ports 10000-20000 open** in your firewall + cloud security
  group. mediasoup uses this range for RTC media. Without it, ICE
  fails on viewers and you'll see "no video" reports.
- **A domain pointing at the VPS** (recommended). Browsers require
  HTTPS for `getUserMedia` — TLS termination is mandatory.

## Step 1 — Clone + configure

The engine source repo is private; self-hosting requires a signed
license. Email **sales@mufconnect.com** to start. Once you have repo
access:

```bash
git clone https://github.com/MufConnect/muf-logic-engine
cd muf-logic-engine
cp .env.example .env
```

Required env vars:

```bash
# ── Secrets — generate fresh values, DO NOT reuse from dev ──
JWT_SECRET=$(openssl rand -base64 48)
APP_INTERNAL_SECRET=$(openssl rand -base64 32)
SFU_INTERNAL_SECRET=$(openssl rand -base64 32)
POSTGRES_PASSWORD=$(openssl rand -base64 32)

# ── Public-facing IP for mediasoup ICE candidates ──
# Set to the VPS's public IP. WITHOUT this, viewers can't reach the SFU.
MEDIASOUP_ANNOUNCED_IP=YOUR.PUBLIC.IP.HERE

# ── Database ──
POSTGRES_USER=muf
POSTGRES_DB=muf_engine

# ── Logging ──
LOG_LEVEL=INFO
LOG_FORMAT=json   # for log aggregation pipelines (Datadog, Loki, CloudWatch)
```

## Step 2 — Bring up the stack

```bash
docker compose up -d
docker compose ps
```

All six services should show `running (healthy)`. If anything's red:

```bash
docker compose logs -f signaling-server  # or whichever service is down
```

Common first-run issues:

- **`MEDIASOUP_ANNOUNCED_IP must be set`** — you didn't fill in the
  public IP. Edit `.env`, `docker compose down && up -d`.
- **Port 5432 / 6379 already in use** — you have a host-installed
  postgres / valkey. Either stop them or change `POSTGRES_PORT` in
  `.env`. The compose binds to `127.0.0.1` so they don't conflict
  with public services on the same host.
- **Cargo build takes >5 minutes** — first run only. Subsequent
  `docker compose build` re-uses the cargo-chef dependency layer in
  ~5 seconds.

## Step 3 — Reverse proxy (nginx) for TLS

Browsers refuse to call `getUserMedia` over plain HTTP except on
`localhost`. Production needs HTTPS. Sample nginx config:

```nginx
# /etc/nginx/sites-available/mufconnect.com

upstream muf_signaling { server 127.0.0.1:3001; }
upstream muf_chat      { server 127.0.0.1:3003; }
upstream muf_app       { server 127.0.0.1:8000; }
upstream muf_static    { server 127.0.0.1:8080; }

server {
    listen 443 ssl http2;
    server_name mufconnect.com;

    ssl_certificate     /etc/letsencrypt/live/mufconnect.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mufconnect.com/privkey.pem;

    # WebSocket → signaling
    location /ws {
        proxy_pass http://muf_signaling;
        proxy_http_version 1.1;
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host       $host;
        proxy_read_timeout 3600s;
    }

    # HTTP routes on signaling-server
    location ~ ^/(create_room|viewer-token|broadcaster-token|router-rtp-capabilities|api/admin/live/rooms|api/live/explore) {
        proxy_pass http://muf_signaling;
        proxy_http_version 1.1;
    }

    # Socket.io → chat-engine
    location /socket.io/ {
        proxy_pass http://muf_chat;
        proxy_http_version 1.1;
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host       $host;
    }

    # FastAPI app
    location ~ ^/(api/v1|health|docs|openapi.json) {
        proxy_pass http://muf_app;
    }

    # Static HTML files (broadcaster.html, viewer.html, etc.)
    location / {
        proxy_pass http://muf_static;
    }
}
```

Get a Let's Encrypt cert with certbot:

```bash
sudo certbot --nginx -d mufconnect.com
```

## Step 4 — Test

Open `https://mufconnect.com/package-livestream/broadcaster.html`.
Allow camera access, type a name, tap **Go LIVE**. Open the share
link from another device → should see video + chat.

## Operations

### Logs

```bash
# Stream all service logs
docker compose logs -f

# Just one service
docker compose logs -f signaling-server

# Errors only
docker compose logs --since 1h | grep -i error
```

### Restart a single service

```bash
docker compose restart media-sfu
```

### Update to a new version

```bash
git pull
docker compose build
docker compose up -d
```

This rebuilds changed services and restarts only those — others
stay up. Zero-downtime is NOT guaranteed (signaling-server needs
brief reconnect window during restart) but is fast.

### Database backup

PostgreSQL data lives in the `postgres_data` Docker volume:

```bash
docker exec muf-postgres pg_dump -U muf muf_engine | gzip > backup-$(date +%F).sql.gz
```

### TURN server (recommended for restrictive networks)

mediasoup's UDP range works ~95% of the time but corporate firewalls
sometimes block UDP entirely. A TURN server (Coturn) over TCP:443
fallback works everywhere. See [Standalone deployment](/guides/standalone-deployment/)
for Coturn setup notes.

## Scaling notes

- **One mediasoup worker per CPU core**, set
  `MEDIASOUP_NUM_WORKERS=` to your core count.
- **Single-VPS limits** — about 50 simultaneous broadcasters or
  500 simultaneous viewers on a 4-vCPU/8GB instance, depending on
  bitrate. Beyond that, run multiple media-sfu instances behind the
  signaling-server and partition rooms by load.
- **Postgres** scales fine to thousands of orgs on a single instance.
  Move to a managed service (RDS / Supabase / Neon / Cloud SQL) when
  you cross ~10k orgs.
- **Valkey** is in-memory; the working set should fit in RAM. With
  10k active rooms, expect ~500 MB.
