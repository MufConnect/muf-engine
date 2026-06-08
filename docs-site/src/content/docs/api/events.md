---
title: LiveEvent
description: Event types emitted by MufLiveManager.
---

```ts
import { LiveEvent } from '@mufconnect/live-sdk';

manager.on(LiveEvent.VIEWER_COUNT, ({ count }) => { ... });
```

## Lifecycle

| Event | Payload | Fires when |
|---|---|---|
| `STATE_CHANGE` | `{ state }` | State machine transitions (IDLE → INITIALIZING → ACTIVE → ENDING) |
| `STREAM_ENDED` | `{ reason }` | Viewer-side: last broadcaster left the room |

## Media

| Event | Payload | Fires when |
|---|---|---|
| `LOCAL_STREAM` | `{ stream }` | Broadcaster's own MediaStream is acquired |
| `REMOTE_STREAM` | `{ peerId, kind, track, stream }` | Viewer: a remote peer's track arrives. `kind` is `'video'` or `'audio'`. Per-track event (audio + video for normal broadcaster = 2 events) |
| `COHOST_STREAM` | `{ peerId, kind, track, displayName, avatarUrl }` | Broadcaster: a cohort's track arrives in the studio recv transport |
| `MEDIA_DEGRADED` | `{ reason, hasVideo, hasAudio }` | Cohost flow: media acquisition partially failed (e.g. audio-only join because camera was OS-locked) |

## Viewer count + chat

| Event | Payload | Fires when |
|---|---|---|
| `VIEWER_COUNT` | `{ count }` | Audience size for THIS host changes (per-host partitioning, L.9) |
| `CHAT` | `{ from, role, displayName, avatarUrl, text }` | New chat message from another peer in the same audience |
| `TYPING` | `{ peerId, typing }` | Another peer started or stopped typing |
| `SHARE_LINK` | `{ link, roomId }` | Broadcaster: viewer share URL (includes `?host=PEER_ID`) |

## Peers

| Event | Payload | Fires when |
|---|---|---|
| `PEER_JOINED` | `{ peerId, displayName, avatarUrl, role }` | Another peer joined the room |
| `PEER_LEFT`   | `{ peerId, displayName, avatarUrl, role }` | A peer left |
| `PEER_AUDIO_MUTE` | `{ peerId, muted }` | A peer's audio producer paused / resumed |
| `PEER_VIDEO_OFF` | `{ peerId, off }` | A peer's video producer paused / resumed |

## Speaker detection

| Event | Payload | Fires when |
|---|---|---|
| `LOCAL_SPEAKING_CHANGED` | `{ isSpeaking }` | Local mic level crossed the threshold |
| `PEER_SPEAKING_CHANGED` | `{ peerId, isSpeaking }` | Remote peer's audio level crossed the threshold |

## Cohost (Phase L.8a)

| Event | Payload | Fires when |
|---|---|---|
| `COHOST_INVITED` | `{ inviteId, fromPeer, fromName, expiresAt }` | F2: host invited THIS viewer to cohost |
| `COHOST_REQUESTED` | `{ inviteId, fromPeer, fromName, expiresAt }` | F3: a viewer requested cohost; broadcast to all current broadcasters |
| `COHOST_INVITE_RESOLVED` | `{ inviteId, accepted, byPeer }` | An invite was accepted or declined |
| `COHOST_INVITE_EXPIRED` | `{ inviteId }` | 30s timeout fired with no resolution |
| `ROLE_UPGRADED` | `{ peerId, newRole, isSelf }` | A peer's role flipped from viewer to broadcaster (after Accept) |
| `ACCEPT_INVITATIONS_CHANGED` | `{ enabled }` | The host's "Allow guest requests" toggle flipped |

## Recording

| Event | Payload | Fires when |
|---|---|---|
| `RECORDING_STARTED` | `{ recordingId }` | Server confirmed recording started |
| `RECORDING_STOPPED` | `{ recordingId, url, expiresAt }` | Recording uploaded to R2; presigned URL for playback |
| `RECORDING_FAILED` | `{ message }` | Recording failed to start or stop |

## Slot system

| Event | Payload | Fires when |
|---|---|---|
| `SLOT_RENDER` | `{ name, mount, ctx }` | A named slot mount node became available |

## Network quality

| Event | Payload | Fires when |
|---|---|---|
| `NETWORK_QUALITY` | `{ tier, stats }` | Outbound (broadcaster) or inbound (viewer) quality changed. `tier` is `EXCELLENT | GOOD | POOR` |
| `QUALITY_CHANGED` | `{ quality, spatial, temporal }` | Viewer: SVC layer changed (auto BWE adjustment or explicit `setVideoQuality`) |

## Local control state

| Event | Payload | Fires when |
|---|---|---|
| `LOCAL_AUDIO_MUTE` | `{ muted }` | `setLocalAudioMute()` was called |
| `LOCAL_VIDEO_OFF` | `{ off }` | `setLocalVideoEnabled()` was called |
