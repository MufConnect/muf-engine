---
title: MufLiveManager
description: High-level API for host / viewer / cohost flows.
---

The main class. One instance per page; manages a single live session.

```ts
import { MufLiveManager, LiveEvent } from '@mufconnect/live-sdk';

const manager = new MufLiveManager({
    orgId:       'your-org-id',     // omit for standalone deployments
    orgKey:      'your-org-key',
    displayName: 'Saad',
    avatarUrl:   'https://...',     // optional
});
```

## Constructor options

```ts
interface LiveManagerOptions {
    orgId?:            string;       // multi-tenant org id (skip in standalone)
    orgKey?:           string;       // multi-tenant org key
    displayName?:      string;       // signed identity in JWT
    avatarUrl?:        string;
    videoConstraints?: MediaTrackConstraints;
    audioConstraints?: MediaTrackConstraints;
    showDebugLog?:     boolean;
}
```

## Host methods

### `preloadCamera(): Promise<void>`

Acquires camera + mic. Idempotent — call early so the user sees their
preview before tapping "Go LIVE". Required before `startBroadcast()`.

### `startBroadcast(opts): Promise<void>`

Creates a room via `/create_room`, joins as host, produces video + audio.

```ts
await manager.startBroadcast({
    title:    'My stream title',
    category: 'gaming',
});
```

### `endBroadcast(): Promise<void>`

Tears down transports, leaves the room, cleans up media tracks.

### `joinAsCoBroadcaster(roomId, token, opts?): Promise<void>`

Joins an existing room as a cohost. Token must have `role: 'host'`
and `room_id` matching `roomId`. Used by the cohost share-link flow
where the customer's backend mints the token via `/broadcaster-token`.

### `setLocalAudioMute(muted): Promise<boolean>`

Pauses / resumes the host's audio producer at the SFU. Returns the
applied state.

### `setLocalVideoEnabled(enabled): Promise<boolean>`

Pauses / resumes the host's video producer. When `false`, the host's
tile in viewer + cohort grids falls back to the avatar placeholder.

### `setRoomAcceptInvitations(enabled): Promise<void>`

Toggles whether viewers can request to cohost (Phase L.8a F3 flow).
Only the original host's call is honored.

### `inviteCohost(inviteePeerId): Promise<void>`

Invites an active viewer to become a cohost (F2). Creates a 30s
pending invite. The viewer's client receives `COHOST_INVITED`.

### `respondCohostInvite(inviteId, accept): Promise<void>`

Accept or decline an invite. For F2 (host-invites-viewer), only the
viewer can call. For F3 (viewer-requests-cohost), any current
broadcaster can call.

## Viewer methods

### `joinAsViewer(roomId, opts?): Promise<void>`

Joins as a passive viewer. Fetches a token from `/viewer-token`
internally.

```ts
await manager.joinAsViewer(roomId, {
    displayName: 'My name',
    avatarUrl:   'https://...',
    hostPeerId:  hostPeerIdFromShareLink,   // L.9 audience anchor
});
```

### `leaveStream(): Promise<void>`

Leaves the room. Subsequent rejoin requires a new `joinAsViewer`.

### `requestCohost(): Promise<void>`

Viewer-side: requests to be promoted to cohost (F3). Fails silently
if the host hasn't enabled `acceptInvitations`.

### `setVideoQuality(quality): Promise<void>`

`'auto' | 'low' | 'medium' | 'high'`. Sets the preferred SVC layer.

## Slot system

### `registerSlot(name, element)`

Manually register a slot mount node. Called by the page's startup
script for static slots. See [Slot system](/guides/slot-system/).

### `autoRegisterSlots(root?: Element)`

Scans a root element (default `document`) for `[data-slot]`
attributes and registers each. Called once after manager construction
by the prebuilt pages.

### `fillSlot(name, content): boolean`

Fills a slot with content. Accepts HTML string, DOM node, function
`(ctx) => Node | string`, or array. Returns `true` on success,
`false` if the slot isn't registered.

### `getSlotMount(name): Element | null`

Returns the slot's mount element for imperative use, or `null` if
not registered.

## Recording

### `startRecording(): Promise<{ recordingId: string }>`

Starts recording the room's active producers. Server-side: only the
original host's call is honored.

### `stopRecording(): Promise<void>`

Stops recording. Triggers a webhook to your backend with the R2 URL
+ duration when the upload completes.

## Common methods

### `sendChat(text): void`

Publishes a chat message to the current audience scope. Validated +
rate-limited by the chat service.

### `getPeerIdentities(): Array<{ peerId, displayName, avatarUrl, role }>`

Snapshot of all known peers in the room.

### `state: LiveState`

Read-only current state. One of `IDLE | INITIALIZING | ACTIVE | ENDING`.

### `roomId: string | null`

Read-only current room id.

### `on(eventName, handler): () => void`

Subscribe to events. Returns an unsubscribe function. See [LiveEvent](/api/events/)
for the full list.

```ts
const off = manager.on(LiveEvent.VIEWER_COUNT, ({ count }) => { ... });
// later
off();
```
