---
title: Migrating from Twilio Programmable Video
description: Twilio is sunsetting Programmable Video (Dec 2026). Here's how to port to MUF Engine.
---

Twilio Programmable Video is being sunset on **December 5, 2026**.
If your live-streaming product depends on it, you have a hard deadline
to migrate.

MUF Engine is a drop-in replacement for the live-streaming subset of
Programmable Video. This guide covers the concept mapping + the
migration checklist.

## Why MUF Engine?

- **Self-hostable.** No vendor lock-in. Run on your own VPS / AWS / GCP.
- **No sunset risk.** Open-source dependencies (mediasoup, Socket.io,
  Rust) with multi-decade trajectories.
- **Lower cost at scale.** Twilio's per-minute pricing compounds; MUF's
  per-MAU model lets you serve 100k viewers without surprise bills.

## Concept mapping

| Twilio | MUF Engine | Notes |
|---|---|---|
| Room | Room | Same. Twilio's "group" / "small group" / "go" room types collapse to MUF's `room_type: 'live'` (broadcast) or `'1v1'` (private call) |
| Local Participant | Broadcaster | Producing media |
| Remote Participant | Viewer or Cohost | Consuming media (viewer) or producing alongside the host (cohost) |
| Track | Producer / Consumer | Per-track in MUF; same conceptual model |
| Access Token | JWT | Same purpose; mint in your backend, ship to client |
| Network Quality Level | `LiveEvent.NETWORK_QUALITY` | Tier-based (excellent / good / poor) |
| Recording | Phase L recording → R2 | MUF records to your own R2 bucket; you control retention |
| Composition | (none — record per-peer) | MUF records each producer separately. Compose post-stream via ffmpeg if needed |
| Insights / Quality metrics | `getStats()` (manual via core SDK) | Less polished UI than Twilio's dashboard but same raw data |

## API mapping

### Initialization

**Twilio:**
```ts
import { connect } from 'twilio-video';

const room = await connect(token, {
    name: roomName,
    audio: true,
    video: true,
});
```

**MUF Engine:**
```ts
import { MufLiveManager } from '@muf/live-sdk';

const manager = new MufLiveManager({ orgId, orgKey, displayName });
await manager.preloadCamera();
await manager.startBroadcast({ title: 'Stream' });
```

### Subscribing to remote tracks

**Twilio:**
```ts
room.participants.forEach(participantConnected);
room.on('participantConnected', participantConnected);

function participantConnected(participant) {
    participant.tracks.forEach((trackPub) => {
        if (trackPub.isSubscribed) {
            attachTrack(trackPub.track);
        }
        trackPub.on('subscribed', attachTrack);
    });
}
```

**MUF Engine:**
```ts
manager.on(LiveEvent.REMOTE_STREAM, ({ peerId, kind, stream }) => {
    if (kind === 'video') {
        document.getElementById(`tile-${peerId}`).querySelector('video').srcObject = stream;
    }
});

await manager.joinAsViewer(roomId, { hostPeerId });
```

Massively simpler. The track-attachment dance collapses to one event handler.

### Mute / camera off

**Twilio:**
```ts
room.localParticipant.audioTracks.forEach((trackPub) => {
    trackPub.track.disable();
});
```

**MUF Engine:**
```ts
await manager.setLocalAudioMute(true);
```

### Disconnect

**Twilio:**
```ts
room.disconnect();
```

**MUF Engine:**
```ts
await manager.endBroadcast();   // host
// or
await manager.leaveStream();    // viewer
```

### Recording

**Twilio:**
```ts
// Configured via REST API on room creation; not per-call
await client.video.v1.rooms.create({ recordParticipantsOnConnect: true });
```

**MUF Engine:**
```ts
await manager.startRecording();
// later
await manager.stopRecording();

manager.on(LiveEvent.RECORDING_STOPPED, ({ url, recordingId }) => {
    console.log(`Recording ready: ${url}`);
});
```

Per-call control instead of room-creation-time configuration. Useful
when you want to record only specific segments of a long stream.

## Migration checklist

- [ ] Audit your Twilio Video usage. Programmable Video API calls vs.
      the React UI Kit (different code paths to migrate).
- [ ] Replace `connect()` calls with `new MufLiveManager(...)` +
      `startBroadcast()` / `joinAsViewer()`.
- [ ] Move token minting from Twilio's `AccessToken` builder to your
      own JWT signer. See [Token minting](/guides/token-minting/).
- [ ] Replace participant connect/disconnect handlers with
      `LiveEvent.PEER_JOINED` / `LiveEvent.PEER_LEFT`.
- [ ] Replace track subscription handlers with `LiveEvent.REMOTE_STREAM`.
- [ ] Replace `track.disable()` calls with `manager.setLocalAudioMute()` /
      `setLocalVideoEnabled()`.
- [ ] Replace `room.disconnect()` with `endBroadcast()` / `leaveStream()`.
- [ ] If using Twilio Recording, set up R2 credentials in your MUF
      Engine deployment + handle the `RECORDING_STOPPED` event.
- [ ] If using Twilio Insights, build your own dashboards from
      `LiveEvent.NETWORK_QUALITY` events.
- [ ] Self-host MUF Engine ([Docker quickstart](/guides/self-hosting/))
      OR use our managed service.
- [ ] Phased rollout: feature-flag the SDK choice, ship to internal
      users first, then percentage of production traffic.
- [ ] Cut over before December 5, 2026.

## Migration timeline (typical)

For a small team with a focused live-streaming product:

- **Week 1**: Spin up MUF Engine self-hosted. Run it side-by-side with
  Twilio, no production traffic yet.
- **Week 2**: Port your token-minting backend. Implement feature flag
  ("video provider: twilio | muf").
- **Week 3-4**: Port the client integration. Test internally.
- **Week 5**: Roll to 1% of production traffic. Monitor for a week.
- **Week 6-8**: Ramp to 100%. Decommission Twilio.

Total: ~2 months for a team of 1-2 engineers. The bulk of time is
verification + monitoring; the code changes are 1-2 weeks.

## Cost comparison

A rough comparison for a product running 10,000 hours/month of video:

- **Twilio Group Rooms**: ~$0.0040 / participant-minute = $24,000 / month
- **MUF Engine self-hosted on a 4-vCPU/8GB VPS**: ~$60 / month + R2 egress

Self-hosting is dramatically cheaper at scale. The tradeoff is
operational ownership — you're responsible for keeping the stack
healthy, scaling, and security patching.

If you want hands-off, our managed service offers MUF Engine at
similar cost-per-stream to Twilio with zero infra to run.
