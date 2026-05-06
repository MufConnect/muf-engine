---
title: Slot system
description: Plug your own widgets (Follow button, gift overlay, custom CTAs) into the prebuilt UI.
---

The MUF Engine prebuilt pages (broadcaster.html, viewer.html) include
named **slot mount points** — DOM containers where you drop in your
own widgets. Slot names are part of the public API and won't be
renamed without a major-version bump.

## The 17 slots, by region

### Header

| Slot name | Where | Customer typically fills |
|---|---|---|
| `header.actionPill` | Right of the host info pill | Follow button, badge |
| `header.promoChips` | Below the topbar | Daily Ranking, Gift Goal, Campaigns |
| `header.topRightActions` | Top-right, left of viewer count | Custom CTAs |

### Viewport (overlays the video)

| Slot | Where | Use |
|---|---|---|
| `viewport.sideCards` | Floating right column | Recommended cohost cards |
| `viewport.floatingFx` | Free overlay | Hearts, gifts, reactions |
| `viewport.bannerTop` | Below header | "We're notifying viewers..." |
| `viewport.bannerBottom` | Above chat | Welcome banners |

### Action bar

| Slot | Where | Use |
|---|---|---|
| `actionBar.bottomLeft` | Left cluster | Quick reactions, custom shortcuts |
| `actionBar.bottomRight` | Right cluster | Gift, custom CTAs |

### Sheet (bottom-up modals)

| Slot | Where | Use |
|---|---|---|
| `sheet.interact` | "Interact" sheet | Polls, votes, draw-and-guess |
| `sheet.effects` | "Effects" sheet | Beauty filter, AR, music |
| `sheet.moreSettings` | Settings dropdown | Fan Club, About Me, Campaigns |
| `sheet.guests` | "Go LIVE with guests" sheet | Friends list for Quick Invites |

### End screen (post-stream)

| Slot | Where | Use |
|---|---|---|
| `endScreen.statsCards` | Stats grid | Gifters, followers, $ earned |
| `endScreen.recommendations` | "Watch next" | Recommended creators |
| `endScreen.cta` | Bottom button row | Custom CTAs |

### Pre-live setup

| Slot | Where | Use |
|---|---|---|
| `setup.topChips` | Top of pre-live | Reward / promo chips |
| `setup.iconRow` | Icon row in bottom panel | Effects, Fan Club, Music tiles |

## Three integration depths

### Layer 1 — config (simplest)

```ts
manager.fillSlot('header.actionPill', '<button>+ Follow</button>');
manager.fillSlot('actionBar.bottomRight', myCustomElement);
manager.fillSlot('endScreen.statsCards', (ctx) => {
    return `<div>💎 ${ctx.broadcasters[0]?.displayName}'s gifts: 0</div>`;
});
manager.fillSlot('header.promoChips', [
    '<span class="chip">🔥 Daily Ranking</span>',
    '<span class="chip">🎁 Gift Goal</span>',
]);
```

`fillSlot` accepts: HTML string, `HTMLElement`, function `(ctx) => Node | string`, or array of any of the above.

### Layer 2 — events + reactive components

```ts
manager.on('SLOT_RENDER', ({ name, mount, ctx }) => {
    if (name === 'header.actionPill') {
        ReactDOM.render(<FollowButton ctx={ctx} />, mount);
    }
    if (name === 'actionBar.bottomRight') {
        const root = createRoot(mount);
        root.render(<GiftDrawer />);
    }
});
```

The event fires once per slot when it's first registered with the
manager. For dynamic content that re-renders on state changes, your
component listens to `manager.on('viewerCount', ...)` etc. itself.

### Layer 3 — imperative escape hatch

```ts
const node = manager.getSlotMount('header.actionPill');
if (node) {
    node.appendChild(myCustomElement);
}
```

Use case: integrating with a framework that wants to manage its own
DOM lifecycle (Web Components, Lit, Stencil, etc.).

## Context object

Every render callback + the `SLOT_RENDER` event payload includes a
`ctx` with the relevant room state:

```ts
type SlotContext = {
    roomId:     string | null;
    role:       'broadcaster' | 'viewer' | null;
    myPeerId:   string | null;
    myIdentity: { displayName?: string; avatarUrl?: string };
    isLive?:    boolean;
    broadcasters?: Array<{
        peerId: string;
        displayName?: string;
        avatarUrl?: string;
    }>;
};
```

## Stability

- **Adding a slot** — non-breaking, ships in any minor version.
- **Renaming a slot** — major-version-only. Old name stays as a
  deprecated alias for one minor version before removal.
- **Removing a slot** — major-version-only. Marked deprecated for one
  minor version first.
- **Changing context fields** — adding fields is non-breaking; changing
  types or removing fields is major-version-only.

When a slot is deprecated, both names fire `SLOT_RENDER` simultaneously
during the deprecation window. Console logs warn on deprecated-name use.
Migrate before the next major.

## What's NOT a slot

These are intentionally NOT customer-extensible:

- Video grid layout (mediasoup-driven, fixed)
- Mic / cam / flip / mirror / pause-LIVE controls
- Chat message rendering (chat-engine consistency)
- Permission recovery modal
- 3-2-1 countdown

If you need one of these, file a feature request — some may move to
slots in a future version after design review.
