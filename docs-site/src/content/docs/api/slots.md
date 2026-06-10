---
title: Slot names
description: The frozen public-API list of all 17 slot mount points.
---

Slot names are part of the public API and are governed by the
breaking-change policy in [the slot system guide](/guides/slot-system/).
Once shipped in a tagged release, names won't be renamed without a
major-version bump.

## Type

```ts
type SlotName =
    | 'header.actionPill'
    | 'header.promoChips'
    | 'header.topRightActions'
    | 'viewport.sideCards'
    | 'viewport.floatingFx'
    | 'viewport.bannerTop'
    | 'viewport.bannerBottom'
    | 'actionBar.bottomLeft'
    | 'actionBar.bottomRight'
    | 'sheet.interact'
    | 'sheet.effects'
    | 'sheet.moreSettings'
    | 'sheet.guests'
    | 'endScreen.statsCards'
    | 'endScreen.recommendations'
    | 'endScreen.cta'
    | 'setup.topChips'
    | 'setup.iconRow';
```

## SlotContext type

```ts
interface SlotContext {
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
}
```

## Slot list with detailed descriptions

### `header.actionPill`
Right side of the host info pill in the topbar (when stream is live).
Customers typically mount: Follow button, badge, role indicator.

### `header.promoChips`
Horizontal row below the topbar. Scrollable on overflow. Examples:
Daily Ranking, Gift Goal, Active Campaigns.

### `header.topRightActions`
Top-right of the topbar, between viewer count and End Stream button.
Compact icon slot — keep contents to a single icon to avoid topbar overflow.

### `viewport.sideCards`
Floating column on the right side of the video area, mid-height.
Recommended for "watch next" creator cards.

### `viewport.floatingFx`
Free overlay across the video area. Hearts, gifts animations,
reactions. The SDK doesn't manage z-stacking inside this slot —
customer code chooses how to layer.

### `viewport.bannerTop` / `viewport.bannerBottom`
Thin banners pinned to the top / bottom of the video area. Use for
announcements, community guidelines reminders.

### `actionBar.bottomLeft` / `actionBar.bottomRight`
Clusters in the live screen's bottom action bar. Left = invite host
+ invite viewer (built-in). Right = chat + share + settings (built-in).
Customer additions appear inline with the built-in icons.

### `sheet.interact`
Bottom-up sheet opened by an Interact icon in `actionBar.bottomLeft`.
Polls, votes, draw-and-guess, trivia, Q&A widgets.

### `sheet.effects`
Bottom-up sheet for media filters. Beauty filter, AR effects, stickers,
music, voice fx.

### `sheet.moreSettings`
Dropdown opened from the host-info menu. Customer pages: Fan Club,
About Me, Campaigns, Fundraiser, Content Disclosure.

### `sheet.guests`
"Go LIVE with guests" sheet (host-side). Customer's friends / contacts
list for Quick Invites flow.

### `endScreen.statsCards`
Below the duration + peak-viewers grid in the end-of-stream wrap-up.
Customer's monetization-specific cards: Gifters, $ earned, new
followers.

### `endScreen.recommendations`
Below stats. "Watch next" creator suggestions, replay CTAs.

### `endScreen.cta`
Bottom button row in the wrap-up. Custom CTAs ("Share recap",
"Schedule next stream", etc.).

### `setup.topChips`
Top of the pre-live setup screen. Reward / promo chips (e.g.
"Scaled LIVE Rewards", "Continue progress").

### `setup.iconRow`
Icon row in the pre-live bottom panel. Customer additions: Effects,
Fan Club, Music, Service+, Interact.
