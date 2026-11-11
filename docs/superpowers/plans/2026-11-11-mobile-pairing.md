# Mobile Pairing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in player in any game on desktop shows a QR code; their phone (same account, Caro web app / PWA) scans it and becomes a full live remote for that same game — board, timers, chat and every in-game action, synced both ways.

**Architecture:** Desktop stays authoritative. Desktop and phone talk over a Supabase Realtime **private** broadcast channel `pair:<uid>:<sessionId>`, which RLS restricts to that user's sessions (this is the "same account" proof). Desktop pushes snapshots of what the game screen renders (the data fields of `RoomApi` for online rooms, of `PracticeMatchViewProps` for bot/practice); phone renders the **existing** `OnlineRoom` / `PracticeMatchView` components with a proxy object whose methods send `call {method,args}` back to the desktop, which invokes the real method. So opponents see ordinary actions from one player.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, `@supabase/supabase-js` Realtime broadcast, `qrcode@1.5.4` (generate), `jsqr@1.4.0` (scan fallback; primary is `BarcodeDetector`).

**Spec:** `docs/superpowers/specs/2026-11-11-mobile-pairing-design.md`

## Global Constraints

- Pairing requires a signed-in account on both devices; `user.isGuest` → no pairing (button shows "Sign in to pair a phone").
- All three must match: same account (RLS-enforced channel), valid QR (current one-time secret), same game (session bound to the game; ends when the game/room session ends).
- QR rotates every **60 s** while the modal is open; each secret is **single use**; the previous secret stays valid for a **10 s** grace after rotation.
- One phone per game: a new successful pair replaces the old phone (old phone gets `bye: replaced`).
- Phone dropping never affects the game. Desktop gone (no message for **10 s**) → phone shows "Desktop disconnected" and returns home.
- Rematch in the same room keeps the pairing; leaving the room or starting a new bot/practice game ends it.
- QR link format: `${location.origin}/#pair=<payload>`, where the payload is in the URL fragment so it never reaches server logs.
- Phone renders the existing mobile layout; desktop-only chrome (sheet disguise) is not mirrored. Phone keeps its own theme/settings.
- Phone "Exit" / "Leave room" button = **unpair** (desktop game continues). Profile/rules modals open locally on the phone.
- Chat images are not inside snapshots; each image travels once as its own `chatImage` message (Realtime message size limit).
- All user-facing strings go through `useT()` with entries in both languages in `src/features/i18n/dict/game.ts` (new `pair.*` keys).
- PWA = web manifest + icons + iOS meta tags. No service worker.
- Commits: conventional commits, **no Co-Authored-By / AI attribution trailer**.

## Review Focus

- **Different account scans the QR** → phone shows "This QR belongs to another account" immediately (uid in payload ≠ phone uid) and never joins. Test in Task 1 (`decodePairLink` keeps uid) + Task 7 (`pairErrorFor`).
- **Screenshot of an old QR scanned after rotation** → rejected `expired`. Test in Task 2.
- **Same QR scanned twice (second phone)** → second hello rejected `used`; the first phone stays. Test in Task 2.
- **Phone taps during opponent's turn / after game end** → call is forwarded and the real room/practice code refuses it as it would on desktop; the phone UI is disabled by the same props. Test in Task 4 (`applyRoomCall` invokes the method unchanged, unknown methods dropped).
- **Malformed / hostile broadcast payloads** (wrong shape, unknown method, huge args) → ignored, no throw. Test in Task 3 (`parsePairMessage`).

## File Structure

```
src/features/pairing/
  pairLink.ts            + .test.ts   QR payload encode/decode
  pairHostSession.ts     + .test.ts   pure host state: secrets, rotation, single-use, active phone
  pairProtocol.ts        + .test.ts   message types + parsePairMessage validator
  pairChannel.ts                      thin Supabase Realtime private-channel wrapper
  roomSnapshot.ts        + .test.ts   RoomApi → snapshot, snapshot → proxy RoomApi, applyRoomCall
  practiceSnapshot.ts    + .test.ts   PracticeMatchViewProps ↔ snapshot/proxy, applyPracticeCall
  PairingContext.tsx                  { canPair, openPairModal, phoneConnected } for the action rail
  usePairHost.ts                      desktop: session, channel, snapshot push, call dispatch
  PairMobileModal.tsx                 desktop: QR modal
  usePairRemote.ts                    phone: hello/handshake, snapshot state, call sender
  RemoteMatchApp.tsx                  phone: renders OnlineRoom / PracticeMatchView with proxies
  QrScanner.tsx                       phone: camera + BarcodeDetector / jsqr
  pairErrors.ts          + .test.ts   reason → i18n key
supabase/migrations/20261111000000_pair_channel_rls.sql
public/manifest.webmanifest, public/icons/caro-192.png, public/icons/caro-512.png
Modify: src/main.tsx, src/app/App.tsx or AppView.tsx (wiring), src/features/game/GameActionRail.tsx,
        src/app/HomePlayActions.tsx, src/features/i18n/dict/game.ts, index.html, package.json
```

---

### Task 1: Pair link codec

**Files:** Create `src/features/pairing/pairLink.ts`, `src/features/pairing/pairLink.test.ts`

**Interfaces — Produces:**
```ts
export interface PairOffer { v: 1; uid: string; sessionId: string; secret: string; kind: 'room' | 'practice' }
export const encodePairLink: (origin: string, offer: PairOffer) => string   // `${origin}/#pair=<base64url(JSON)>`
export const decodePairLink: (input: string) => PairOffer | null            // accepts full URL or bare `#pair=…`/payload
export const readPairFromLocation: (hash: string) => PairOffer | null
```

- [ ] **Step 1: Write failing tests** — `pairLink.test.ts`:
  - round trip: `decodePairLink(encodePairLink('https://x.app', offer))` deep-equals `offer`.
  - link starts with `https://x.app/#pair=` and contains no `+`, `/`, `=` after `pair=` (base64url, unpadded).
  - returns `null` for: `''`, `'https://x.app/'`, `'#pair=!!!'`, JSON with `v: 2`, missing `secret`, input longer than 2048 chars.
  - `readPairFromLocation('#pair=' + payload)` equals the offer.
- [ ] **Step 2:** `npx vitest run src/features/pairing/pairLink.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement** with `btoa`/`atob` + `TextEncoder` (UTF-8 safe), strict shape check (all strings non-empty, ≤ 128 chars).
- [ ] **Step 4:** rerun → PASS.
- [ ] **Step 5: Commit** `feat(pairing): add pair link codec`

### Task 2: Host session state (pure)

**Files:** Create `src/features/pairing/pairHostSession.ts`, `.test.ts`

**Interfaces — Produces:**
```ts
export const SECRET_ROTATE_MS = 60_000; export const SECRET_GRACE_MS = 10_000;
export interface PairHostState { sessionId: string; current: { secret: string; issuedAt: number }; previous: { secret: string; retiredAt: number } | null; used: string[]; phoneId: string | null }
export type HelloResult = { ok: true; state: PairHostState; replacedPhoneId: string | null } | { ok: false; reason: 'expired' | 'used' }
export const createHostState: (now: number, rand: () => string) => PairHostState
export const rotateIfDue: (s: PairHostState, now: number, rand: () => string) => PairHostState   // same object if not due
export const acceptHello: (s: PairHostState, secret: string, phoneId: string, now: number) => HelloResult
export const dropPhone: (s: PairHostState, phoneId: string) => PairHostState
```

- [ ] **Step 1: Failing tests:**
  - `rotateIfDue` at `issuedAt + 59_999` returns same object; at `+60_000` returns new `current`, old one in `previous` with `retiredAt = now`.
  - `acceptHello` with current secret → ok, `phoneId` set, secret added to `used`, `replacedPhoneId === null`.
  - same secret again (other phone) → `{ ok:false, reason:'used' }`, `phoneId` unchanged.
  - previous secret within 10 s of `retiredAt` → ok; at `retiredAt + 10_001` → `expired`; random secret → `expired`.
  - second phone with a fresh (rotated) secret → ok, `replacedPhoneId` = first phone id.
  - `dropPhone` with a non-matching id leaves state unchanged.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement (immutable updates). **Step 4:** run → PASS.
- [ ] **Step 5: Commit** `feat(pairing): add host session secret rotation`

### Task 3: Protocol, channel and RLS

**Files:** Create `src/features/pairing/pairProtocol.ts` + `.test.ts`, `src/features/pairing/pairChannel.ts`, `supabase/migrations/20261111000000_pair_channel_rls.sql`

**Interfaces — Produces:**
```ts
// phone → desktop
| { t: 'hello'; phoneId: string; secret: string }
| { t: 'call'; phoneId: string; method: string; args: unknown[] }
| { t: 'ping'; phoneId: string }
| { t: 'bye'; phoneId: string }
// desktop → phone
| { t: 'welcome'; phoneId: string }
| { t: 'reject'; phoneId: string; reason: 'expired' | 'used' }
| { t: 'snapshot'; phoneId: string; seq: number; kind: 'room' | 'practice'; data: unknown }
| { t: 'chatImage'; phoneId: string; id: string; image: string }
| { t: 'end'; phoneId: string; reason: 'replaced' | 'game_ended' | 'unpaired' | 'desktop_closed' }
export type PairMessage = …; export const parsePairMessage: (raw: unknown) => PairMessage | null
export const pairTopic: (uid: string, sessionId: string) => string          // `pair:${uid}:${sessionId}`
export interface PairChannel { send(msg: PairMessage): void; close(): void }
export const openPairChannel: (uid: string, sessionId: string, onMessage: (m: PairMessage) => void, onStatus: (s: 'joined' | 'error') => void) => PairChannel
```

- [ ] **Step 1: Failing tests** for `parsePairMessage`: each valid variant round-trips; returns `null` for `null`, `'x'`, unknown `t`, `call` with non-array `args`, `call` whose JSON exceeds 64 KB, `snapshot` with non-number `seq`, `reject` with unknown reason. Never throws (wrap a fuzz loop over `[undefined, 1, [], {t:'call'}]`).
- [ ] **Step 2:** FAIL. **Step 3:** implement validator. `openPairChannel` uses `supabase.channel(pairTopic(..), { config: { private: true, broadcast: { self: false } } })`, event name `'pair'`, `parsePairMessage` on receive; calls `supabase.realtime.setAuth()` before subscribing. No-op channel when `supabase` is null.
- [ ] **Step 4:** PASS.
- [ ] **Step 5: Migration** `20261111000000_pair_channel_rls.sql`: on `realtime.messages`, two policies for `authenticated` (`select` and `insert`), both `using/with check (realtime.messages.extension = 'broadcast' and split_part((select realtime.topic()), ':', 1) = 'pair' and split_part((select realtime.topic()), ':', 2) = (select auth.uid())::text)`. Do **not** apply to production in this task — dry run only (`supabase db lint` or apply to a branch); production apply is an owner "apply" gate.
- [ ] **Step 6: Commit** `feat(pairing): add pair protocol, realtime channel and RLS`

### Task 4: Room snapshot + remote RoomApi

**Files:** Create `src/features/pairing/roomSnapshot.ts`, `.test.ts`

**Interfaces — Consumes:** `RoomApi` (`src/features/room/useRoomCore.ts:710`), `liveClocks` (`src/features/room/roomEngineHelpers.ts:75`), `ChatMessage`.
**Produces:**
```ts
export const ROOM_METHODS: readonly (keyof RoomApi)[]   // every function-valued key except clocksNow, graceSecondsLeft, hostNow
export const LOCAL_ONLY_ROOM_METHODS = ['leaveRoom', 'dismissTease', 'dismissSeatOpened', 'clearError', 'createRoom', 'joinRoom', 'reset', 'resumeFromUrl'] as const
export interface RoomSnapshot { fields: Record<string, unknown>; clocks: Clocks | null; graceByMember: Record<string, number | null>; hostNow: number }
export const buildRoomSnapshot: (room: RoomApi) => RoomSnapshot      // non-function fields; chatMessages with `image` removed and `hasImage: true` added
export const chatImagesOf: (room: RoomApi) => Array<{ id: string; image: string }>
export const createRemoteRoomApi: (snap: RoomSnapshot, receivedAt: number, images: Record<string, string>, call: (method: string, args: unknown[]) => void, local: { leaveRoom: () => void }) => RoomApi
export const applyRoomCall: (room: RoomApi, method: string, args: unknown[]) => boolean   // false if not in ROOM_METHODS or in LOCAL_ONLY
```

- [ ] **Step 1: Failing tests** (build a fake `RoomApi` with `vi.fn()` methods and a small state):
  - `ROOM_METHODS` contains `move`, `sendChat`, `requestUndo`, `resign`, `buzz`, `markChatSeen`, `offerRematch`; a type-level check `ROOM_METHODS satisfies readonly FunctionKeys<RoomApi>[]` plus a runtime test that every function key of the fake (minus the 3 timing fns) is in `ROOM_METHODS ∪ LOCAL_ONLY`.
  - `buildRoomSnapshot` output passes `JSON.parse(JSON.stringify(x))` deep-equal (no functions), and a chat message with `image: 'data:…'` comes out without `image`.
  - remote api: `remote.move(3,4,'center')` → `call('move',[3,4,'center'])`; `remote.leaveRoom()` → `local.leaveRoom` called, `call` not called; `remote.chatMessages[i].image` is filled from `images`.
  - `remote.clocksNow()` during `phase === 'playing'` equals `liveClocks(game-with-snap.clocks, now - receivedAt)` (fake `performance.now`).
  - `applyRoomCall(room,'move',[1,2])` calls `room.move(1,2)` → true; `'leaveRoom'` → false, not called; `'__proto__'` → false.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat(pairing): mirror RoomApi as snapshot and remote proxy`

### Task 5: Practice snapshot + remote props

**Files:** Create `src/features/pairing/practiceSnapshot.ts`, `.test.ts`

**Interfaces — Consumes:** `PracticeMatchViewProps` (`src/app/PracticeMatchView.tsx:22`).
**Produces:**
```ts
export const PRACTICE_CALLS = ['onCellClick', 'onUndo', 'onRematch', 'onBotFirst'] as const
export type PracticeSnapshot = Omit<PracticeMatchViewProps, 'user' | 'openProfileModal' | 'setOpponent' | typeof PRACTICE_CALLS[number] | 'onExit'>
export const buildPracticeSnapshot: (p: PracticeMatchViewProps) => PracticeSnapshot
export const createRemotePracticeProps: (s: PracticeSnapshot, call: (m: string, a: unknown[]) => void, local: Pick<PracticeMatchViewProps, 'user' | 'openProfileModal' | 'setOpponent' | 'onExit'>) => PracticeMatchViewProps
export const applyPracticeCall: (p: PracticeMatchViewProps, method: string, args: unknown[]) => boolean
```

- [ ] **Step 1: Failing tests:** snapshot is JSON-clean and excludes `user`; `remote.onCellClick(2,3,'center')` → `call('onCellClick',[2,3,'center'])`; `remote.onExit` is the local one; `applyPracticeCall(p,'onExit',[])` → false; `applyPracticeCall(p,'onUndo',[])` calls `p.onUndo`.
- [ ] **Step 2–4:** FAIL → implement → PASS. Timers: desktop pushes a snapshot every second while playing (Task 6), so no client extrapolation here.
- [ ] **Step 5: Commit** `feat(pairing): mirror practice match props`

### Task 6: Desktop host — modal, rail button, wiring

**Files:** Create `PairingContext.tsx`, `usePairHost.ts`, `PairMobileModal.tsx`; Modify `src/features/game/GameActionRail.tsx`, the App component that owns `room` and practice props (`src/app/AppView.tsx`), `src/features/i18n/dict/game.ts`, `package.json` (`qrcode@1.5.4`, `@types/qrcode`).

**Interfaces — Consumes:** Tasks 1–5. **Produces:**
```ts
export interface PairingContextValue { canPair: boolean; needsSignIn: boolean; phoneConnected: boolean; openPairModal: () => void }
export const PairingContext: React.Context<PairingContextValue | null>
export const usePairHost: (input: { user: UserProfile | null; source: { kind: 'room'; room: RoomApi; gameKey: string } | { kind: 'practice'; props: PracticeMatchViewProps; gameKey: string } | null }) =>
  { modalOpen: boolean; link: string | null; secondsLeft: number; phoneConnected: boolean; open(): void; close(): void; unpair(): void }
```
- `gameKey`: room → `room.roomId` (rematches keep it); practice → an id minted in `AppView` each time a bot/practice game starts (including a bot rematch, since the spec says a new bot/practice game ends pairing).
- Behaviour: channel opens when modal first opens; `rotateIfDue` on a 1 s interval while modal open; on `hello` → `acceptHello` → `welcome` (+ `end: replaced` to old phone) → push full snapshot + all chat images; push snapshot on every change of the source (`useEffect` on the snapshot JSON string) and at least every 1 s while a game is playing; `call` from the active phone → `applyRoomCall`/`applyPracticeCall`; ignore calls from other phone ids. `gameKey` change or source → null → send `end: game_ended` and close. `beforeunload`/unmount → `end: desktop_closed`.
- Modal: QR via `QRCode.toDataURL(link, { errorCorrectionLevel: 'M', margin: 4, scale: 6 })`, countdown "Refreshes in Ns", status "Phone connected ✓", "Unpair" button. Rail button (icon `Smartphone` from lucide-react) shown only when `useIsDesktop()` and context present; disabled with title `pair.signInFirst` when `needsSignIn`; green tone when `phoneConnected`.
- Desktop toast via existing `showNotice` on phone connect / disconnect.

- [ ] **Step 1:** add deps, i18n keys (`pair.button`, `pair.title`, `pair.instructions`, `pair.refreshesIn`, `pair.connected`, `pair.unpair`, `pair.signInFirst`, `pair.phoneConnected`, `pair.phoneDisconnected`, plus phone keys used in Task 7).
- [ ] **Step 2:** implement hook, context, modal, rail button, wiring in `AppView.tsx` (build the practice props object once and pass the same object to `PracticeMatchView` and `usePairHost`).
- [ ] **Step 3: Verify:** `npm run lint && npm test && npm run build` → all pass. Manual: desktop in bot game → rail shows button → modal shows QR that changes every 60 s.
- [ ] **Step 4: Commit** `feat(pairing): desktop pair-mobile modal and host sync`

### Task 7: Phone remote — scan, handshake, mirrored game

**Files:** Create `usePairRemote.ts`, `RemoteMatchApp.tsx`, `QrScanner.tsx`, `pairErrors.ts` + `.test.ts`; Modify `src/main.tsx` (or the App root) for routing, `src/app/HomePlayActions.tsx` (Scan QR button), `package.json` (`jsqr@1.4.0`).

**Interfaces — Produces:**
```ts
export type PairError = 'not_signed_in' | 'other_account' | 'expired' | 'used' | 'no_desktop' | 'invalid_qr' | 'camera_denied'
export const pairErrorFor: (offer: PairOffer | null, user: UserProfile | null) => PairError | null   // pre-connect checks
export const pairErrorKey: (e: PairError) => string
export const usePairRemote: (offer: PairOffer, user: UserProfile) =>
  { status: 'connecting' | 'paired' | 'ended' | 'error'; error: PairError | null; endReason: string | null; kind: 'room' | 'practice' | null;
    room: RoomApi | null; practice: PracticeMatchViewProps | null; unpair(): void }
```

- [ ] **Step 1: Failing tests** for `pairErrorFor`: `null` offer → `invalid_qr`; guest user → `not_signed_in`; `offer.uid !== user.uid` → `other_account`; matching → `null`. `pairErrorKey` returns an existing `pair.*` key for every `PairError`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Implement the rest:**
  - Routing: when `readPairFromLocation(location.hash)` returns an offer, render `<RemoteMatchApp offer=…/>` instead of `<App/>` (inside the existing providers); wait for auth `loading` to finish; if not signed in show the existing auth modal with a "sign in with the account you use on desktop" line. Clear the hash with `history.replaceState` after reading so a reload does not reuse a spent secret; keep the offer in `sessionStorage('caro:pair')` for reconnects within the same game.
  - `usePairRemote`: random `phoneId`, open channel, send `hello`, 8 s timeout → `no_desktop`; `reject` → its reason; `welcome` → `paired`; keep latest snapshot + `receivedAt`, image map; `ping` every 3 s; no message from desktop for 10 s → `ended` with `desktop_closed`; `end` → `ended`.
  - `RemoteMatchApp`: `room` kind → `<OnlineRoom room={remoteRoom} …/>` (local rules/profile modals); `practice` → `<PracticeMatchView {...remoteProps}/>`; slim top bar "Paired with desktop · Unpair"; ended/error screens with a "Back home" button (clears session, `location.hash = ''`, reload to App).
  - `QrScanner`: `getUserMedia({ video: { facingMode: 'environment' } })`; `BarcodeDetector` with `formats: ['qr_code']` when available, else draw frames to a canvas and run `jsqr` every 200 ms; on a decoded string that `decodePairLink` accepts → `location.assign(link)`; denied → `camera_denied` message with tip to use the phone camera app instead.
  - Home: "Scan QR to pair" button in `HomePlayActions` shown when `!useIsDesktop()`.
- [ ] **Step 6: Verify:** `npm run lint && npm test && npm run build` pass.
- [ ] **Step 7: Commit** `feat(pairing): phone scanner and mirrored remote game`

### Task 8: PWA install

**Files:** Create `public/manifest.webmanifest`, `public/icons/caro-192.png`, `public/icons/caro-512.png`; Modify `index.html`.

- [ ] **Step 1:** manifest: `name: "Caro League"`, `short_name: "Caro"`, `start_url: "/"`, `display: "standalone"`, `background_color: "#0b1728"`, `theme_color: "#0b1728"`, icons 192/512 (`purpose: "any maskable"`). Icons: resize `public/caro-tab-logo.png` (centred on `#0b1728` square, ~10% padding) with a one-off script in the scratchpad, not committed.
- [ ] **Step 2:** `index.html`: `<link rel="manifest" href="/manifest.webmanifest">`, `<link rel="apple-touch-icon" href="/icons/caro-192.png">`, `<meta name="apple-mobile-web-app-capable" content="yes">`, `<meta name="mobile-web-app-capable" content="yes">`.
- [ ] **Step 3: Verify:** `npm run build`, `npm run preview`, Chrome DevTools > Application > Manifest shows no errors and "Installable".
- [ ] **Step 4: Commit** `feat(pwa): add web app manifest and icons`

### Task 9: End-to-end verification

- [ ] Apply the RLS migration to a Supabase **branch** (owner approves production apply separately).
- [ ] Two browser contexts signed in to the same account (desktop + mobile emulation via chrome-devtools MCP): bot game → pair → place a stone from phone → appears on desktop and bot replies on both; undo/rematch from phone.
- [ ] Online room with a third context as opponent: moves both ways, timers tick on phone, chat from phone appears once for opponent, opponent chat + image + buzz appear on phone, rematch keeps pairing, leaving room ends pairing on phone.
- [ ] Negative: other account scans → "other account"; wait > 70 s and scan old QR → expired; second phone with same QR → used; close desktop tab → phone shows disconnected within 10 s.
- [ ] `npm run lint && npm test && npm run build` final pass; record outputs in the PR.
