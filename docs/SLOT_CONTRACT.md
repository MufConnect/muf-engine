# MUF Live SDK — Slot Contract

**Stability promise.** Slot names listed in this document are part of
the SDK's public API. Once a slot ships in a tagged release, its name
will not be renamed. New slots can be added; deprecated slots will be
documented as such for at least one minor version before removal.

- **Contract version:** 0.1.0
- **Last updated:** 2026-05-05
- **Audience:** customer integrators (L1 / L2 / L3) who want to extend
  the prebuilt broadcaster / viewer pages with their own UI.

## Background

The MUF Live SDK ships an opinionated UI (broadcaster.html, viewer.html)
that handles core call mechanics: video tiles, chat overlay, mic / cam /
flip / mirror controls, host + cohost identity pills, viewer count,
3-2-1 countdown, "stream ended" screen.

It does **not** ship monetization, social-graph, or platform-specific
features (gifts, follow, fan clubs, AR effects, polls, custom widgets).
Those vary per customer and live in the customer's app.

To bridge the two, the SDK exposes **named slots** — fixed mount points
in the prebuilt UI where the customer drops in their own elements. The
slot names are the contract.

## Three layers, one slot taxonomy

The same slot names work across all three integration depths:

| Layer | Customer code | API style |
|---|---|---|
| **L1 — Prebuilt** (`<script src="muf-live.js">`) | Pass slots in the mount config | Static config |
| **L2 — Components** (npm package, React/Vue) | Subscribe to events, render reactive slot components | Events + props |
| **L3 — Raw SDK** (advanced) | Get the raw mount node, attach anything | Imperative DOM |

A customer can mix layers — config for static slots, events for dynamic
ones, imperative for an escape hatch.

## Layer 1 — Static config

```js
MufLive.mount('#root', {
  roomId, token,
  slots: {
    'header.actionPill':    '<button class="follow-btn">Follow</button>',
    'header.promoChips':    [
      '<span class="chip">Daily Ranking</span>',
      '<span class="chip">Gift Goal</span>'
    ],
    'actionBar.bottomRight': document.getElementById('my-gift-button'),
    'sheet.interact':        renderInteractSheet,   // function returning DOMNode | string
  },
  endScreen: 'default'  // 'default' | 'none' | { slots: {...} }
});
```

Accepted slot value types:
- `string` — interpreted as HTML, sanitized and inserted
- `HTMLElement` (or `Node`) — appended as-is
- `function` — called with `(ctx) => DOMNode | string`. `ctx` carries
  current room state for context-aware rendering.
- `Array` of any of the above — appended in order

## Layer 2 — Events with data payloads

```js
const manager = new MufLiveManager({...});

manager.on('slot:render', ({ name, mount, ctx }) => {
  if (name === 'header.actionPill') {
    // Customer renders their own React/Vue/Svelte component into `mount`
    ReactDOM.render(<FollowButton ctx={ctx} />, mount);
  }
});

manager.on('viewerCount', ({ count }) => {
  // Update a customer-managed slot reactively
  myGiftBadge.update(count);
});
```

Events fire on slot lifecycle (`mount`, `ctx-changed`, `unmount`) so the
customer's component re-renders without polling.

## Layer 3 — Imperative escape hatch

```js
const node = manager.getSlotMount('header.actionPill');
// node is the slot's container <div>. Attach anything — a Web Component,
// a React root, raw DOM, an iframe — the SDK will not touch its contents.
node.appendChild(myCustomElement);
```

`getSlotMount()` returns `null` if the slot is not currently rendered
(e.g. a sheet that hasn't been opened yet). Use the `slot:render` event
to know when the mount becomes available.

---

## Slot taxonomy

All slots are namespaced `<region>.<position>`. Region groups slots by
where they appear in the UI; position is a stable, descriptive name.

### Header region (top of broadcaster + viewer pages)

| Slot name | Description | Customer typically fills |
|---|---|---|
| `header.actionPill` | Right side of the host info pill, next to display name | Follow button, badge, role indicator |
| `header.promoChips` | Horizontal row of pills below the header | Leaderboards, gift goals, campaign banners |
| `header.topRightActions` | Top-right corner, left of the close button | Custom CTAs, share button, settings shortcut |

### Viewport region (overlays on the video area)

| Slot name | Description | Customer typically fills |
|---|---|---|
| `viewport.sideCards` | Floating column on the right side, mid-height | Recommended-cohost cards, sponsored widgets |
| `viewport.floatingFx` | Free overlay across the video for animations | Hearts, gift animations, reactions, particle effects |
| `viewport.bannerTop` | Thin banner pinned to top of video, below header | "We're notifying viewers", live announcements |
| `viewport.bannerBottom` | Thin banner above chat overlay | "Welcome to LIVE!", community-guidelines reminders |

### Action bar region (bottom of broadcaster page)

| Slot name | Description | Customer typically fills |
|---|---|---|
| `actionBar.bottomRight` | Right-aligned cluster of icon buttons above chat input | Gift, Share, Custom CTAs |
| `actionBar.bottomLeft` | Left-aligned cluster, next to chat input | Quick reactions, shortcut to interact sheet |

### Sheet region (bottom-up modal panels)

| Slot name | Description | Customer typically fills |
|---|---|---|
| `sheet.interact` | Bottom-up sheet, opened by the Interact icon | Polls, votes, draw-and-guess, trivia, Q&A widgets |
| `sheet.effects` | Bottom-up sheet, opened by the Effects icon | Beauty filter, AR effects, stickers, music, voice fx |
| `sheet.moreSettings` | Dropdown opened from the host-info menu | Fan Club, About Me, Campaigns, Fundraiser, Content Disclosure |
| `sheet.guests` | "Go LIVE with guests" sheet (host-side) | Customer's friends/contacts list for Quick Invites |

The SDK ships an empty sheet shell with the title bar, close handle, and
swipe-to-dismiss behavior. The customer fills the body via the slot.

### End-screen region (after stream ends)

| Slot name | Description | Customer typically fills |
|---|---|---|
| `endScreen.statsCards` | Stats grid below the duration | Gifters count, new followers, $ earned |
| `endScreen.recommendations` | Below stats, "Watch next" section | Recommended creators, replay CTAs |
| `endScreen.cta` | Bottom button row | "Go LIVE again", "Share recap", custom CTAs |

The SDK's default end-screen always shows duration + peak-viewers + ended
timestamp using only data the engine produces. Customer slots extend it.

---

## Lifecycle events

These are the events you can subscribe to on the SDK manager. They fire
in addition to the existing `LiveEvent` set.

| Event | Payload | Fires when |
|---|---|---|
| `slot:render` | `{ name, mount, ctx }` | A slot's mount node first becomes available in the DOM |
| `slot:ctx` | `{ name, ctx }` | The context object for a slot changes (room state update relevant to that slot) |
| `slot:unmount` | `{ name }` | A slot is being removed from the DOM (e.g. a sheet being dismissed) |
| `streamStarted` | `{ roomId, startedAt }` | Stream actually starts (after the 3-2-1 countdown completes) |
| `streamEnded` | `{ roomId, durationSec, peakViewers, endedAt }` | Stream ends (host taps End or session disconnects). Customer can render their own end-screen using this. |
| `viewerCount` | `{ count }` | Viewer count changes (peer joined / left) |

## Context object

Every slot's render callback and `slot:ctx` event receives a `ctx`
object with the relevant state for that slot:

```ts
type SlotContext = {
  // Always present
  roomId:      string;
  role:        'host' | 'viewer';
  myPeerId:    string;
  myIdentity:  { displayName?: string; avatarUrl?: string };

  // Present in broadcaster pages
  isLive?:        boolean;          // false during pre-stream setup
  durationSec?:   number;           // current stream duration
  viewerCount?:   number;
  broadcasters?:  Array<{ peerId: string; displayName?: string; avatarUrl?: string; isOriginalHost: boolean }>;

  // Present when slot is associated with a specific peer (e.g. cohost-pill slots)
  targetPeerId?:  string;
};
```

The SDK never exposes raw media Producer / Consumer objects in
`ctx` — those are internal. If a customer needs media-pipeline access,
they're at L3 and use the manager's lower-level methods directly.

## Slot security

- HTML strings passed to slots are sanitized. The SDK strips `<script>`
  tags, inline event handlers (`onclick`, etc.), and `javascript:` URIs
  before insertion.
- Customers passing `HTMLElement` or `function → DOMNode` are trusted —
  the customer is in their own JS execution context and can attach
  anything, including their own React roots and event listeners.
- The SDK does not inject CSS into customer-supplied elements. Customers
  are responsible for their own styling. The SDK exposes CSS variables
  (`--muf-accent`, `--muf-radius`, etc.) that customers should respect
  to keep visual consistency, but does not enforce them.

## Stability and breaking-change policy

| Change type | Allowed without major-version bump | Notes |
|---|---|---|
| Add a new slot name | Yes | New slots are additive |
| Add a new field to `ctx` | Yes | Customers should treat unknown fields as ignored |
| Add a new lifecycle event | Yes | Existing handlers are unaffected |
| Rename a slot | NO — major bump only | Rename means publish under new name + keep old name as deprecated alias for one minor version |
| Remove a slot | NO — major bump only | Slot must be marked `@deprecated` for at least one minor version first |
| Change a `ctx` field's type | NO — major bump only | Type changes break customer code silently |
| Change which region a slot renders into | NO — major bump only | Customers may rely on visual position |

When a slot is deprecated, both the old and new names will fire
`slot:render` simultaneously during the deprecation window. Logs will
warn on use of the deprecated name. Customers should migrate before the
next major.

## What's NOT a slot

These are intentionally **not** customer-extensible:

- The video grid layout itself (1 / 2 / 3 / 4 broadcaster arrangement) —
  fixed, engine-driven
- Mic / cam / flip / mirror / pause-LIVE controls — core call mechanics
- Chat message rendering — controlled by the chat service for moderation
  consistency. Customers can add a `viewport.bannerBottom` slot above
  chat for announcements; the chat itself is not theirable.
- Permission recovery modal — platform-specific OS messaging, must be
  consistent across customers
- The 3-2-1 countdown — visual consistency across the platform

If a customer asks for one of these, file it as a feature request, not
a slot ask. Some may move to slots in a future version after design
review.

## Examples

### Adding a Follow button (L1)

```html
<script src="https://cdn.muf.live/v0.1/muf-live.js"></script>
<script>
  MufLive.mount('#root', {
    roomId: 'abc123', token: '...',
    slots: {
      'header.actionPill': `
        <button id="follow-btn" class="my-follow-btn">+ Follow</button>
      `
    }
  });

  document.getElementById('follow-btn').addEventListener('click', () => {
    // Customer's own follow API
    fetch('/api/follow', { method: 'POST', body: JSON.stringify({...}) });
  });
</script>
```

### Adding a Gift sheet (L2 — React)

```jsx
import { useMufLive } from '@mufconnect/live-sdk/react';

function StreamPage() {
  const manager = useMufLive({ roomId, token });

  return (
    <MufLive
      manager={manager}
      slots={{
        'actionBar.bottomRight': <GiftButton onSend={(gift) => manager.emit('chat', { from: myPeerId, text: `🎁 ${gift.name}` })} />,
        'sheet.interact':        <PollSheet polls={polls} onVote={handleVote} />,
      }}
    />
  );
}
```

### Custom end-screen (L3)

```js
const manager = new MufLiveManager({...});

manager.mount('#root', {
  endScreen: 'none'   // we'll render our own
});

manager.on('streamEnded', ({ roomId, durationSec, peakViewers }) => {
  document.getElementById('root').innerHTML = `
    <my-custom-end-screen
       duration="${durationSec}"
       peak="${peakViewers}"
       gifters="${myGiftersCount}"
       earnings="${myEarnings}">
    </my-custom-end-screen>
  `;
});
```
