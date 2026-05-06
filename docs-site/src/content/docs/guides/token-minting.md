---
title: Token minting
description: Sign JWTs in your backend so the SDK can authorize broadcaster + viewer access.
---

The MUF Engine SDK does NOT mint tokens client-side — that would
require shipping `JWT_SECRET` to the browser. Your backend signs
JWTs with the shared secret, then your client requests them through
your own auth-protected endpoint.

## What goes in the token

```ts
{
  room_id:           string,    // required — UUID
  role:              'host' | 'viewer' | 'guest',
  room_type:         'live' | '1v1',
  max_peers?:        number,
  display_name?:     string,    // signed identity → other peers' chat avatars
  avatar_url?:       string,
  is_original_host?: boolean,   // true ONLY for the room creator
  host_peer_id?:     string,    // L.9 audience anchor; see below
  exp:               number,    // unix-seconds — keep short (1h for viewers, 24h for hosts)
}
```

The `JWT_SECRET` env var must be the SAME on:
- The signaling-server (validates incoming tokens)
- The chat-engine (validates incoming Socket.io connections)
- Your token-minting backend (signs them)

Use a strong random value (≥48 bytes recommended):

```bash
openssl rand -base64 48
```

## host_peer_id — the L.9 audience anchor

For per-host chat partitioning to work in multi-broadcaster rooms,
every JWT carries a `host_peer_id` claim that identifies WHICH
broadcaster's audience the peer belongs to.

- **Broadcasters**: `host_peer_id` is THEIR OWN peer_id. Generate a
  UUID at token mint, embed in the JWT, and the broadcaster client
  uses that exact value as their WebSocket `peer_id`.
- **Viewers**: `host_peer_id` is the peer_id of the broadcaster they
  came in for. Falls back to the room's `original_host_peer_id` when
  absent.

If the broadcaster's WS `peer_id` doesn't match their JWT's
`host_peer_id`, the chat-engine partitions them into different
scopes — chat appears broken (you can chat with yourself but no
viewers see it). Always align them.

## Examples

### Node (Express)

```ts
import express from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';

const app = express();
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET!;

// Host token — for the user creating + broadcasting the stream
app.post('/api/host-token', async (req, res) => {
    const user = await authenticateUser(req);  // your auth
    if (!user) return res.status(401).end();

    const roomId      = uuid();
    const hostPeerId  = uuid();

    const token = jwt.sign({
        room_id:          roomId,
        role:             'host',
        room_type:        'live',
        display_name:     user.displayName,
        avatar_url:       user.avatarUrl,
        is_original_host: true,
        host_peer_id:     hostPeerId,
        exp:              Math.floor(Date.now() / 1000) + 86400,
    }, JWT_SECRET);

    res.json({ token, roomId, peerId: hostPeerId });
});

// Viewer token — viewers fetch this when joining a stream
app.post('/api/viewer-token', async (req, res) => {
    const user = await authenticateUser(req);
    if (!user) return res.status(401).end();

    const { roomId, hostPeerId } = req.body;

    const token = jwt.sign({
        room_id:      roomId,
        role:         'viewer',
        room_type:    'live',
        display_name: user.displayName,
        avatar_url:   user.avatarUrl,
        host_peer_id: hostPeerId,    // which audience to join
        exp:          Math.floor(Date.now() / 1000) + 3600,
    }, JWT_SECRET);

    res.json({ token });
});

// Cohost token — when your app invites a user to co-broadcast
app.post('/api/cohost-token', async (req, res) => {
    const user = await authenticateUser(req);
    if (!user) return res.status(401).end();

    const { roomId } = req.body;
    const cohostPeerId = uuid();

    const token = jwt.sign({
        room_id:      roomId,
        role:         'host',
        room_type:    'live',
        display_name: user.displayName,
        avatar_url:   user.avatarUrl,
        host_peer_id: cohostPeerId,
        exp:          Math.floor(Date.now() / 1000) + 3600,
    }, JWT_SECRET);

    res.json({ token, peerId: cohostPeerId });
});
```

### Python (FastAPI)

```python
import os, time, uuid
from fastapi import FastAPI, Depends, HTTPException
from pydantic import BaseModel
import jwt

app = FastAPI()
JWT_SECRET = os.environ['JWT_SECRET']

class HostTokenRequest(BaseModel):
    pass

@app.post('/api/host-token')
async def host_token(user = Depends(authenticate_user)):
    room_id      = str(uuid.uuid4())
    host_peer_id = str(uuid.uuid4())

    token = jwt.encode({
        'room_id':          room_id,
        'role':             'host',
        'room_type':        'live',
        'display_name':     user.display_name,
        'avatar_url':       user.avatar_url,
        'is_original_host': True,
        'host_peer_id':     host_peer_id,
        'exp':              int(time.time()) + 86400,
    }, JWT_SECRET, algorithm='HS256')

    return { 'token': token, 'roomId': room_id, 'peerId': host_peer_id }
```

### Go (net/http)

```go
package main

import (
    "encoding/json"
    "net/http"
    "os"
    "time"

    "github.com/golang-jwt/jwt/v5"
    "github.com/google/uuid"
)

var jwtSecret = []byte(os.Getenv("JWT_SECRET"))

type HostTokenResponse struct {
    Token  string `json:"token"`
    RoomID string `json:"roomId"`
    PeerID string `json:"peerId"`
}

func hostTokenHandler(w http.ResponseWriter, r *http.Request) {
    user, err := authenticateUser(r)
    if err != nil {
        http.Error(w, "unauthorized", 401)
        return
    }

    roomID     := uuid.NewString()
    hostPeerID := uuid.NewString()

    claims := jwt.MapClaims{
        "room_id":          roomID,
        "role":             "host",
        "room_type":        "live",
        "display_name":     user.DisplayName,
        "avatar_url":       user.AvatarURL,
        "is_original_host": true,
        "host_peer_id":     hostPeerID,
        "exp":              time.Now().Add(24 * time.Hour).Unix(),
    }
    token, _ := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(jwtSecret)

    json.NewEncoder(w).Encode(HostTokenResponse{
        Token:  token,
        RoomID: roomID,
        PeerID: hostPeerID,
    })
}
```

## Wiring the SDK to your token endpoint

In tenant-aware mode (using our App API), the SDK calls
`/create_room` and `/viewer-token` directly. In standalone or custom
flows, override via `setTokenProvider`:

```ts
import { MufLiveManager, MufCore } from '@muf/live-sdk';

const manager = new MufLiveManager({
    displayName: currentUser.name,
});

// Tell MufCore where to fetch tokens from
manager.core.setTokenProvider(async (opts) => {
    const res = await fetch('/api/host-token', {
        method: 'POST',
        headers: { Authorization: `Bearer ${myAuthToken}` },
        body:    JSON.stringify(opts),
    });
    if (!res.ok) throw new Error('Token mint failed');
    return await res.json();   // { token, roomId, peerId }
});

await manager.startBroadcast({ title: 'My stream' });
```

## Security checklist

- [ ] `JWT_SECRET` lives in your backend env (never shipped to clients).
- [ ] Your token-mint endpoint authenticates the requesting user
      (via your own session / API key / OAuth — the SDK is auth-agnostic).
- [ ] Token TTL is short (≤24h for hosts, ≤1h for viewers).
      Long-lived tokens that leak are dangerous.
- [ ] You include `display_name` and `avatar_url` from your trusted
      user record, NOT from client-supplied request bodies. Client
      can lie; your DB doesn't.
- [ ] In multi-tenant deployments, you mint tokens with the org's
      credentials (`x-org-id` + `x-org-key`) on the backend
      `/create_room` call — clients never see those.
