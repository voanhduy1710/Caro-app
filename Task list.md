# Task list

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
