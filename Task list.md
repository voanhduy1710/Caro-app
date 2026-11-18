# Task list

## 2026-11-18 — delete review, commit, push, deploy
- ⏳ 1. Delete the code review (`CODE_REVIEW.md` removed)
- ⏳ 2. Commit and push everything
- ⏳ 3. Deploy to Vercel with `deploy_vercel.ps1`

## 2026-11-18 — Orca as an app style, not a board
- ✅ 1. Remove the Orca board option: gone from the board list; PR 5's code grid now shows only inside the Orca style (in place of graph paper). tsc clean, vitest 402 passed; not committed
- ✅ 2. Add a Style section in Settings: Default / Orca (`src/features/theme/uiStyle.ts`, stamped before first paint). Not committed
- ✅ 3. Orca style = UI exactly like PR 5 (shell, sidebar, titlebar, mobile, every restyled screen), without PR's multi-room tabs; Default (today's look) stays the default for new visitors
- ✅ Opus 5.5 subagent (orca A, shell) — scoped Orca CSS (`src/styles/orca/`) + Geist, primitives + cn, shared useUiTheme (Orca dark default), Orca shell (titlebar tabs, Orca|GGS pill, sidebar, mobile bars, right-pane slot), lobby `*.orca.tsx`, AppView switches layout without remounting the Board (browser-checked); Leaderboard/History/Settings tabs still open today's modals (phase C); tsc clean, vitest 407 passed, oxlint no new warnings, build OK; not committed
- ✅ Opus 5.5 subagent (orca B, match) — PR 5 match stage in Orca (248px match sidebar, chat column, phone strips + 80dvh chat sheet), seat cards, action rail, chat, board overlays/code-grid cells, coin/RPS dialogs, Sheets "Orca IDE" return (Orca only); Board never remounts (browser-checked 1440/390/320, light+dark, GGS, Ctrl+Q, 1v1v1); tsc/vitest 407/oxlint/build clean; online-room chat + minigames not tried in a browser; not committed
- ⚠️ Opus 5.5 subagent (orca C, rooms + dialogs) — Orca looks for waiting room, roster, chat room, room prompts, tease toast, sign-in, profile (today's password form), opponent, history/leaderboard/rank guide/settings (dialogs + embedded workspace pages), pairing; Default unchanged; tsc clean, vitest 407 passed, oxlint no new warnings, build OK; browser-checked Orca dark/light desktop+phone and Default; ⚠️ pair-mobile/QR/remote phone not tried (need sign-in); not committed
- ✅ Claude (main) — all 3 phases in; own checks: tsc clean, vitest 407 passed, build OK, no new lint warnings; browser /bot Orca 1440 dark: stones survive Orca↔GGS↔Orca, no console errors; fixed board losing its centre after switching to Spreadsheet and back (both styles). Not tried by me: coin toss / RPS in a two-browser Orca room, pairing screens (need sign-in). Not committed

## 2026-11-18 — new values for `.env` + `.mcp.json`
- ⚠️ 1. Update `.env` + `.mcp.json`, links for new values: Supabase URL + anon key checked against live project, already current (no change). Vercel token, Cloudflare TURN token, Supabase access token, Stitch key must be made by owner in their dashboards (links given)
- ✅ 2. Owner deleted all old keys → remove Stitch MCP from `.mcp.json`: done, JSON valid, servers left: supabase-mcp-server, vercel. File gitignored, nothing to commit

## 2026-11-18 — fix the open review items
- ✅ 8. Owner rotated the leaked keys: every token in `.env` / `.mcp.json` now differs from the leaked copy (checked by comparison, values not shown); Supabase URL + anon key unchanged (public by design)
- ✅ 1. "Reset to 123456" button → reset to a typed password: button removed, one new-password + confirm form (min 8). Not tried with a real sign-in; not committed
- ✅ 2. `gomoku_users` emails readable with the anon key → fix: migration `20261118000100` (column grants). File only, NOT applied to Supabase
- ✅ 3. submit-match Elo farming: points 1–4 implemented (both tickets on every rated row, first-writer tickets, 10 games/day per pair, +60 Elo/day per opponent, min 9 moves / 20 s with both reports compared); sign-up gate rejected. Migration `20261118000400` + `submit-match` NOT applied / deployed; client sends moveCount + durationMs; not committed
- ✅ 4. Fix the six medium security items, room takeover by uid, and the 17 open bugs (incl. "3/2 players"): all fixed, see the round-2 commit. Migrations + edge functions are files only (NOT applied / deployed); vitest 402 passed; not committed
- ✅ 5. Explain the `.env` + `.mcp.json` in pushed history point (answered in chat)
- ⚠️ 6. Delete `.env` + `.mcp.json` from git history: origin (voanhduy1710) already holds no ref with them (redesign branch gone, no tags/PRs). Local `backup-remote-sept18` + old `redesign/antigravity-ui` rewritten without the two files (59 / 53 commits kept), stale cnttatino ref dropped. ❌ `cnttatino-spec/Caro-app` not reachable from either gh account (private) — owner must delete the `redesign/antigravity-ui` branch there. Nothing pushed
- ✅ 7. Say which keys are in the old `.env` / `.mcp.json` and whether they are still live (names only, answered in chat)
- ✅ Claude (main) — subagents done; client wired (rated body moveCount/durationMs, new result codes, TURN auth header + TTL); browser-checked keyboard play, dialog focus, Back button on /bot
- ⚠️ Opus 5.5 subagent (backend) — emails hidden (column grants), profile CHECKs + update grant, seat-ticket first-writer-wins, submit-match: names from DB, both tickets for every rated insert, min 9 moves/20 s, 10 games + 60 Elo per pair/day (also in finaliser), api/turn session/origin check + TTL 1 h/30 min + rate limit, .env out of uploads; 4 migrations 20261118000100-400; tsc clean, vitest 400 passed; needs client wiring (moveCount/durationMs, turn Bearer + refetch, new codes); files only: NOT applied to Supabase, NOT deployed, not committed
- ✅ Opus 5.5 subagent (room2) — items 1–9 done and verified (token-only reclaim, 60 s viewer grace + absent viewers yield their place, malformed kick removes member and token, duplicate chat ids rejected + id in REJECTED, full-state timestamp for countdowns/hostNow, T in 3-player score key, restored room keeps isPublic/mode, lobby {n}/{total}); item 10 (react purity) skipped as not clean; tsc clean, oxlint no new warnings; not committed; vitest 371 passed
- ✅ Opus 5.5 subagent (app) — 123456 reset removed (one typed-password form, min 8, i18n), practice sync re-runs, rated queue per uid, history modal uid/stale-safe, no fake Blitz timer, Back guard removed on exit, keyboard cell moves (focus-visible, not LMAO), dialog focus trap in useModalChrome + lightbox + emote picker, scripts on service-role key (clear_data --yes + project), inspect_gomoku.js git rm; tsc/oxlint/build clean; not committed; vitest 376 passed

## 2026-11-17 — code review + clean-up; Orca style from PR 5
- ✅ 1. Thorough code review of the project (read task list + commit history first): report was in `CODE_REVIEW.md` (deleted 2026-11-18). Not committed
- ✅ 2. Clean up dead code: 5 files, 8 assets, 2 deps, ~45 dead / over-exported symbols, unused CSS + i18n keys. knip now lists only entry points. Not committed
- ✅ 3. Refactoring points; unify constants: theme lists, `src/shared/constants.ts`, piece colours, room TTLs / limits unified. ⚠️ big file splits (Board, AppView, AuthContextProvider, OnlineRoomView) only listed in the review, not done
- ✅ 4. Some UI clean-up: board centring, minigame / error text in i18n (EN + VI), accessibility one-liners, unused CSS. Checked in a browser on `/bot` only
- ✅ 5. PR 5 NOT merged. Orca style added as a new board theme (Laser grid kept). Checked in a browser, light + dark. Not committed
- ✅ Bugs fixed on the way : 7 room engine bugs with 19 new tests, bot stone after game over, AI worker crash hang, chat IME send, auth listener deadlock risk (⚠️ not tried with a real sign-in). tsc clean, vitest 346 passed, build OK
- ⚠️ Open, need owner decision : 10 security items (secrets in pushed history, "Reset to 123456" button, emails readable by anon key, Elo farming via submit-match …) and 16 bugs. Nothing changed for these
- ✅ Opus subagent (room) — all 13 room/webrtc items done (seat T, hidden RPS pick, opening reset, coin caller, 3p rematch, rejoin name, 3p lobby, 5h TTLs, board sizes/limits, signed/isRecord, tick/ping consts, claim/discard helpers, dead v1 keys + rematch.expiresAt); 19 tests added; tsc clean; lobby "{n}/2 players" text left for main; not committed; vitest 346 passed

## 2026-11-13 — push to GitHub, pull PR 5
- ⚠️ 1. Push project to GH: `main` already equals `origin/main` (voanhduy1710/Caro-app), nothing to push. Local-only branches (feat/mobile-pairing, feat/mobile-pairing-core, pr-3, pr-4) and untracked AGENTS.md / CLAUDE.md / Task list.md not pushed; waiting for user
- ❌ 2. Pull PR https://github.com/cnttatino-spec/Caro-app/pull/5 to local: blocked, repo "not found" for both gh accounts (voanhduy1710, cntt-atino). Not pulled

Rebuilt on 2026-11-11 from git history (all branches) plus Claude and Codex chat history for this repo. Dates are local
time (UTC+7). Before 2026-10-03 there is no chat history, so those entries list commits only.

## 2026-11-11 — mobile pairing (QR remote for a game)
- ✅ 1. Design + plan: phone scans a QR shown during a game, then plays as the same player in that same game. Pairing only works when the account, the QR and the game all match. Covers bot, practice and online rooms, chat synced too. Built as a web app + PWA, no APK. Docs: `docs/superpowers/specs/2026-11-11-mobile-pairing-design.md` and `docs/superpowers/plans/2026-11-11-mobile-pairing.md` (both untracked in the main checkout; committed as e233e6b)
- ✅ 2. Write 2 Sonnet tasks to an md file for ChatGPT / Codex: `PAIRING_HANDOFF_TASKS.md` (untracked)
- ✅ 3. Task 1 pair link codec (c836376) + Task 2 host session secret rotation (f1aec5c), done by Codex on `feat/mobile-pairing-core`; reviewed and merged into `feat/mobile-pairing` (a0e8641)
- ✅ 4. Tasks 3–5: pair protocol, realtime channel + RLS migration (79b92bd), RoomApi snapshot / remote proxy (107267f), practice mirror (bd10f0f)
- ✅ 5. Task 8: PWA manifest + icons (671ba70)
- ⚠️ 6. Task 6, desktop pair-mobile modal + host sync (ca24ddb), and Task 7, phone scanner + mirrored remote game (355a671): committed on `feat/mobile-pairing` but not listed as reviewed in `.tasks/mobile-pairing.md` yet
- ❌ 7. Task 9: end-to-end test, apply the pairing migration to a Supabase branch. Not done
- ❌ 8. Merge `feat/mobile-pairing` to main / deploy: not done (not asked yet)

## 2026-11-11 — task list rule
- ✅ 1. Add the DNTT-Atino style task list rule to this project: `CLAUDE.md` (Task list section + git / deploy rules) and `AGENTS.md` (Codex points to it). Not committed
- ✅ 2. Build this `Task list.md` from commit + Claude + Codex history

## 2026-11-10 — spreadsheet border; Just chatting = game chat
- ✅ 1. Spreadsheet board: black border on the board edge, then changed to 1px; normal cells outside the border fixed (c03ba14)
- ✅ 2. Supabase check: joy00 vs bot history (30 matches, all losses). Info only
- ✅ 3. Just chatting uses the same chat as gameplay (reply, sound, buzz, emoji, Seen), with the code fully shared through `useGameChat` (24a3183). Marked done by owner 2026-11-11

## 2026-11-09 — sheet chat fixes; bot hint
- ✅ 1. Sheet board chat auto-scrolls to the bottom like the normal chat (4fac46b)
- ✅ 2. Reply button moved outside the bubble and shown on hover, rectangular shape, rounded corners back to original size; profile picture reverted to the letter circle (4fac46b)
- ✅ 3. Bot hint button for `smurf_account` only: suggests a move with a yellow border that goes away after any move, using the same engine as the practice bot (915b40a)
- ✅ 4. Change the hint icon from lightbulb to robot (marked done by owner 2026-11-11; code at `GameActionRail.tsx:163` still showed `Lightbulb` then)
- ✅ 5. "Nothing happens when I click" the hint button (marked done by owner 2026-11-11)

## 2026-11-04
- ✅ 1. Vietnamese README `READMEVN.md` (0ae162a)

## 2026-11-03 — 1v1v1 pings + forced defense (Codex)
- ✅ 1. Ctrl+right-click puts a ping (red !) that every player sees, with a wave animation repeating every 7s until a stone covers it or it is cleared. One ping per player at a time. Right-click on it clears it; "Clear simulations" clears it too (bbdc188)
- ✅ 2. Forced defense rule in 1v1v1 (4 in a row wins): X X · X / X · X X → must block the gap; · X X X · → must block an end. Forced cells get a yellow border (bbdc188)
- ✅ 3. Ping colour matches the player's stone colour (3acefb6). Pushed and deployed to Vercel
- ✅ 4. Ping sound `public/ping-sound.mp3` with a 5s cooldown (7b0e197). Pushed and deployed
- ✅ 5. Push to `cnttatino-spec/Caro-app` (remote `cnttatino` added, 7b0e197)
- ✅ 6. 1v1v1 takebacks follow the settings; one opponent's approval is enough (5019ac7). Pushed to both remotes, deployed, 173 tests
- ✅ 7. Rule from the user: from now on, push only when asked

## 2026-10-27 / 28 — /bot page
- ✅ 1. Play vs Bot gets its own `/bot` route + "Let bot play first" button under the bot avatar (fe36a8c, committed 10-28)

## 2026-10-26 — Supabase checks
- ✅ 1. Joy00 / Yugi Muto vs bot results. Info only
- ✅ 2. Reset `smurf_account` password to 123456 (auth.users, live). Login not tested

## 2026-10-22 — questions only
- ✅ 1. Q&A: P2P chat is not saved; Supabase Realtime as a socket server; Telegram / Zalo / Lark bot options; cost of saving every message. No code

## 2026-10-21 — chat Seen, Just chatting, language
- ✅ 1. Seen / not seen on chat messages, between players at the table only (f260f78)
- ✅ 2. Public rooms empty state: plain text "Currently no rooms exist" instead of the create buttons (f260f78)
- ✅ 3. Settings → Vietnamese / English language switch (f260f78)
- ✅ 4. Play-the-bot box: smaller image + "Just chatting" button, which opens a chat-only room (f260f78)
- ✅ 5. Chat UI changed to the pasted format (f260f78)
- ✅ 6. Merge everything to main and push (fast-forward to f260f78, 125 tests)

## 2026-10-19 / 21 — bot vs crossing-twos setup
- ✅ 1. "Bot is weak against the 2+2 setup": tested over 12 games and it already blocks the key corner, so no code change. Marked done by owner 2026-11-11
- ✅ 2. Supabase: is there vs-bot data besides monsieurfish? Add 25 losses for joy00 within the last 2 hours (done, live DB)

## 2026-10-16 — bot fixes, Elo min 1, bot history in Supabase
- ✅ 1. Bot stops playing after the user loses 7 times: fixed by resetting `isAiThinking` on undo (0e7e9cd)
- ✅ 2. Bot thought bubbles after a game ("I'll win next time" / "EZ" …), shown as 4 bubbles (83db53f)
- ✅ 3. Old rank-badge test in LeaderboardModal updated for 12 ranks, 110/110 tests
- ✅ 4. Elo change is at least 1 (0df5c42). Migration applied + `submit-match` v7 deployed via the Supabase MCP
- ✅ 5. Store vs-bot history in Supabase + sync old local history on site open (1c6e67e). Migration applied to live. Checked for monsieurfish / joy

## 2026-10-15 — board size + bot strength
- ✅ 1. Questions on 19x19 / 22x22 / 30x30 for the bot. Answered
- ✅ 2. Bot board to 19x19 (47998ff)
- ✅ 3. Bot does not block the square / strong-point setups: VCT search added (47998ff)
- ✅ 4. Avatar overflows the player panel (47998ff, MatchHeader). Not checked in a browser

## 2026-10-13 — rejoin, move numbers, loss streak
- ✅ 1. Unlimited rejoins after leaving a seat (35edc98)
- ✅ 2. Move-order numbers on simulated moves, as a plain superscript number (9cb5723)
- ✅ 3. "What's my winning move as X". Answered
- ✅ 4. Loss streak with `public/lose.gif`, moved slightly lower (7d4850f). Migration + `submit-match` v6 deployed, backfilled

## 2026-10-12 — new ranks
- ✅ 1. Plastic + Cardboard ranks below Stone, linked to badges, GPT image prompt given (0a129ff, ad35490). Pushed to `voanhduy1710/Caro-app`

## 2026-10-03 — strong bot
- ✅ 1. Stronger but light bot, frontend only: VCF solver + iterative deepening, zobrist board, shape table, 15x15 bot board (1fce67a … 81b5c3a). Pushed to main
- ✅ 2. Double down side bet with a 5-move expiry (3fe5f3f, 6e7b406, be05ef2); host session backup recovery (fa08bf7)

## 2026-09-10 → 2026-10-07 — commits only (no chat history)
- ✅ 09-10 / 11: Antigravity / arcade redesign, match screen rebuild, settings dialog, avatars from Riot Data Dragon, auth + submit-match security fixes, privacy fix (no emails), room engine v2 + headless room tests, rated-result resend
- ✅ 09-16 / 18: Supabase avatar bucket, LMAO corner mode, 1v1v1 three-player mode, chat sounds / GIFs, algebraic coords, coin flip / RPS turn decider
- ✅ 09-19 / 23: secrets out of git, modular refactor, 4-in-a-row for 3 players, Supabase Auth, README, disconnect-win claim + reconnect fixes, Vercel env sync
- ✅ 09-24 / 10-02: per-player clocks, bell, ranks, Cloudflare TURN relay, ELO rank badges, logo v2, host kick, chat replies, rank guide
- ✅ 10-05 / 07: casual / ranked rooms, move count, rematch + ghost-move fixes, Yahoo emoticons, Google Sheets boss-key disguise with comments, Ctrl+Q, buzz
