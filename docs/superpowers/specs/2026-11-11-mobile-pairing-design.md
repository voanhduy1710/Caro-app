# Mobile Pairing (Phone as Remote Controller) — Design

Date: 2026-11-11
Status: Draft, awaiting owner approval
Reference: stablyai/orca desktop→mobile pairing (QR offer → phone scans → phone becomes live remote for desktop)

## Intent

A player in a game on desktop can pick up their phone and keep playing as themselves. The phone is a full
second screen and controller for the same game, in the same web app (mobile browser, no install). The two
devices are joined by scanning a QR code.

Why: play from the couch / away from the keyboard while the big screen still shows the board; use a phone
as a touch controller.

## Pairing rules (owner-decided)

A phone joins a game only when all three match:

1. **Same account** — the phone is signed in to the same Caro account as the desktop.
2. **Valid QR** — the phone scanned the QR the desktop is currently showing.
3. **Same game** — the QR is bound to one game; the pairing ends when that game ends.

Once paired, the phone acts as **the same player** as the desktop. It is not a second player.

## Goals

- In-game **"Pair mobile"** button on desktop → modal with a QR code.
- Mobile web app has a **"Scan QR"** button (home screen and in-game entry point) → camera → pair.
- Works in **every game type**: bot, practice, online rooms (casual and ranked).
- **Everything synced, both directions**:
  - board: moves from either device appear on both immediately; opponent moves and turn timers show on the
    phone in online rooms;
  - **chat**: messages from either device and from other room members appear on both; includes buzz and
    seen receipts (from commit 24a3183);
  - **all in-game actions** available on the phone that the desktop has: undo, hint, resign, rematch,
    emotes/tease, double-down, etc. In effect the phone is the full mobile in-game UI.
- Actions from the phone go out **as the desktop player**; other room members see one player, not two.

## Non-goals

- Native mobile app (React Native/Expo as in Orca). Phone side is the existing web app.
- Pairing across different accounts or guest-to-anything.
- Playing two different games at once, or the phone outliving the game it was paired to.
- Persistent "paired devices" list across games (Orca has one; not needed here — pairing is per game).

## Anti-goals (failure even if it "works")

- Someone else scanning a photo/screenshot of the QR and controlling your game.
- Opponents seeing a second player, a duplicate join, or duplicate chat messages.
- The phone dropping (screen lock, bad Wi-Fi) disrupting or forfeiting the desktop game.
- Desynced board (phone shows a different position than desktop).

## Constraints

- Stack: Vite + React 19 web app, Supabase auth/data, peerjs (WebRTC) already used for online rooms.
- Guest accounts live only in browser localStorage (`AuthContextProvider.loginAsGuest`) → no server
  identity to compare → **guests cannot pair**. Desktop button shows "Sign in to pair a phone".
- Phone and desktop may be on different networks (not LAN-only), so the link must work over the internet.

## Shape of the solution (decided at the level of the conversation)

- **Desktop is authoritative.** It keeps the real game state, bot, timers and the room connection. The phone
  talks only to the desktop. The phone renders desktop-pushed state and sends intents (place stone, chat,
  undo, …) which the desktop executes through its existing code paths — so opponents see normal actions.
- **QR content** is a normal https link to the app, e.g. `https://<app>/pair#<offer>`, so scanning with the
  phone's native camera also opens the app. Offer contains the desktop's link address (e.g. peer id) and a
  one-time, short-lived secret (minutes). Secret is in the URL fragment so it never hits server logs.
- **Verification on connect:** desktop checks (a) the one-time secret, (b) the phone's account is the same
  Supabase user, proven server-side (e.g. phone sends its Supabase access token / signed proof the desktop
  can verify — not a self-reported user id), (c) the game id in the offer is the current game.
  Fail → clear error on phone ("Different account", "QR expired", "Game already ended").
- **Lifecycle:** phone disconnect → game unaffected, desktop shows "Phone disconnected", re-scan (or
  auto-reconnect within the same game) to resume. Game end / desktop close → phone shows "Game ended" and
  returns home. Desktop can unpair at any time; one phone per game at a time (new pair replaces old).
- Both devices stay fully playable while paired; whoever acts first wins, desktop serializes.

## Left to the builder

- Transport choice (reuse peerjs data channel vs Supabase Realtime channel as relay/fallback) and the
  message protocol (likely mirror `features/room/protocol.ts` patterns).
- How account identity is verified concretely (token check via Supabase, edge function, or signed nonce).
- QR library for generating, and QR scanning approach (`BarcodeDetector` with a JS fallback such as jsQR).
- How the phone UI is assembled from existing game/room/chat components vs a thin mirror view.
- Handling bot/practice games (local state on desktop) vs online rooms (desktop is a room client) under one
  sync layer.
- Expiry duration, reconnect policy details, i18n strings (vi/en dict).

## Phone platform (owner-decided)

- **Web app + PWA.** The phone side is the existing Caro web app in the mobile browser, made installable
  (web app manifest + icons, standalone display) so it can be added to the home screen. No APK / native app.
- The app already has a responsive mobile layout (`useIsDesktop`, `GameControlsView` layout `'mobile'`).
  When paired, the phone renders that existing mobile game screen, fed by the desktop's game state instead
  of running its own.

## Lifecycle calls (owner said "implement" with these open — Claude's calls)

- **Desktop closes / lid shuts mid-game:** pairing ends; phone shows "Desktop disconnected". The game
  follows existing rules for a closed desktop (no phone takeover).
- **Rematch in the same room keeps the phone paired** (same room session). Leaving the room, or a new bot /
  practice game, ends pairing.

## Builder-check resolutions (Claude's calls)

- **Transport + identity:** use a Supabase Realtime *private* channel scoped to the user and game
  (e.g. `pair:<userId>:<gameId>`), authorized by Realtime RLS so only that user's sessions can join. This
  proves "same account" without the desktop ever seeing the phone's token, needs no new backend, and works
  across networks/NAT (no TURN needed). The one-time QR secret is still checked by the desktop as the
  "valid QR" rule. Builder verifies Realtime authorization is available on the project; if not, fallback is
  a small edge function that verifies the token.
- **QR rotation:** QR refreshes every ~60 s while the modal is open; each secret is single use.
- **Game id:** online rooms use room code + match number; bot/practice mint a game id when the game starts.
- **Concurrent dialogs** (undo request, double-down confirm, etc.): shown on both devices; the first answer
  wins and dismisses the other.
- **Phone parity = in-game UI only** (board, timers, chat, all in-game actions, sounds/vibration on the
  phone). App settings, themes and profile are not mirrored; phone uses its own theme setting.
- **Scanning:** in-app scanner must work on iOS Safari → `BarcodeDetector` with jsQR fallback is required.
  Native-camera scan of the link also works.

## Calls made by Claude (owner did not explicitly decide — check these)

- Guests cannot pair.
- QR expires after a few minutes and is single use.
- Desktop is authoritative; phone is a remote, not an independent game client.
- Phone drop never affects the game.
- One phone per game.
- Pairing ends when the game ends (from rule 3).
