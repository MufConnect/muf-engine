---
title: Migrating from Agora
description: Concept-mapping for porting an Agora Interactive Live Streaming integration to MUF Engine.
---

If you're moving from Agora's Interactive Live Streaming SDK to MUF
Engine, most concepts have a one-to-one analog. This guide walks
through the mapping.

## Concept mapping

| Agora | MUF Engine | Notes |
|---|---|---|
| Channel | Room | Both are isolated session containers identified by a string ID |
| App ID | (none — JWT signing) | MUF authenticates via JWTs minted in your backend; no separate App ID concept |
| Token | JWT | Same purpose; MUF tokens carry richer claims (display_name, host_peer_id) |
| Host role | `role: 'host'` | Same. Also called "broadcaster" in MUF docs |
| Audience role | `role: 'viewer'` | Same |
| Co-host role change | F2 / F3 invitation flow | MUF makes role changes a 30-second invite/accept handshake instead of an instant API call |
| RTM (chat) | chat-engine (Socket.io) | Separate service; partitioned by `(roomId, hostPeerId)` for multi-host |
| Cloud Recording | Phase L recording → R2 | Recordings upload to your Cloudflare R2 bucket |
| Stream Quality (auto / high / low) | `setVideoQuality(quality)` | Same SVC-style layer selection |
| Network quality callback | `LiveEvent.NETWORK_QUALITY` | Same tier semantics (excellent / good / poor) |

## API mapping

### Initialization

**Agora:**
```ts
const client = AgoraRTC.createClient({ mode: 'live', codec: 'vp9' });
await client.setClientRole('host');
await client.join(appId, channel, token, uid);
```

**MUF Engine:**
```ts
const manager = new MufLiveManager({ orgId, orgKey, displayName });
await manager.preloadCamera();
await manager.startBroadcast({ title, category });
```

The setRole + join collapse into `startBroadcast()` (host) or
`joinAsViewer()`. The codec is auto-negotiated server-side.

### Publishing

**Agora:**
```ts
const localTrack = await AgoraRTC.createCameraVideoTrack();
const localAudio = await AgoraRTC.createMicrophoneAudioTrack();
await client.publish([localTrack, localAudio]);
```

**MUF Engine:** Done automatically by `startBroadcast()`. `LOCAL_STREAM`
event fires with the MediaStream when ready.

### Subscribing (audience)

**Agora:**
```ts
client.on('user-published', async (user, mediaType) => {
    await client.subscribe(user, mediaType);
    user.videoTrack.play(`remote-${user.uid}`);
});
```

**MUF Engine:**
```ts
manager.on(LiveEvent.REMOTE_STREAM, ({ peerId, kind, stream }) => {
    if (kind === 'video') {
        document.getElementById(`tile-${peerId}`).querySelector('video').srcObject = stream;
    }
});

await manager.joinAsViewer(roomId, { displayName, hostPeerId });
```

The subscription happens automatically — `REMOTE_STREAM` fires per-track
as remote producers come online.

### Role change

**Agora:**
```ts
await client.setClientRole('host');     // viewer becomes broadcaster
```

**MUF Engine:** Two-step (security boundary):
```ts
// Viewer-side: request to cohost
await manager.requestCohost();

// Listen for the host's response
manager.on(LiveEvent.ROLE_UPGRADED, ({ peerId, isSelf }) => {
    if (isSelf) {
        // SDK auto-creates SendTransport + produces media on the existing connection
    }
});
```

The host approves via `respondCohostInvite(inviteId, true)`. This is
deliberately not a one-line API: it forces a human-in-the-loop check
that prevents silent privilege escalation in customer apps.

### Chat (RTM)

**Agora RTM:**
```ts
await rtmClient.login({ uid, token });
await rtmChannel.join();
await rtmChannel.sendMessage({ text: 'hello' });
```

**MUF Engine:**
```ts
manager.sendChat('hello');

manager.on(LiveEvent.CHAT, ({ from, displayName, text }) => {
    console.log(`${displayName}: ${text}`);
});
```

The chat-engine connects automatically as part of `startBroadcast()` /
`joinAsViewer()` — no separate client needed.

## What's different

- **No App ID + Customer Certificate dance.** MUF uses a single
  `JWT_SECRET` shared between your backend and the signaling-server.
- **No "channel attribute" key/value store.** Use your own backend
  for any non-message room state.
- **Token TTLs are stricter.** Agora tokens default to 24h+; MUF
  recommends 1h for viewers, 24h for hosts. Renew via your backend.
- **No watermark / image overlay APIs (yet).** Render watermarks
  client-side via slots (`viewport.bannerBottom`).
- **Audience partitioning per host.** In multi-broadcaster rooms,
  each host has their own chat + viewer count. Agora's RTM channel
  is room-wide; MUF partitions by `(roomId, hostPeerId)`.

## Migration checklist

- [ ] Replace `AgoraRTC.createClient` calls with `new MufLiveManager`.
- [ ] Move token minting from Agora's RtcTokenBuilder to your own JWT
      signer (Node example: see [Token minting](/guides/token-minting/)).
- [ ] Replace `client.setClientRole` calls with `startBroadcast` /
      `joinAsViewer` / role-upgrade flow.
- [ ] Replace `user-published` handlers with `LiveEvent.REMOTE_STREAM`.
- [ ] Replace RTM channels with `MufLiveManager.sendChat` / `LiveEvent.CHAT`.
- [ ] Update token TTLs in your backend.
- [ ] Self-host (or use our managed service).

For the WebRTC primitives (peer connection, ICE, DTLS), MUF and Agora
both use mediasoup-style SFU patterns — the underlying protocols are
identical. The migration is a SDK-surface refactor, not a transport rewrite.
