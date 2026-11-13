# Rules for agents working in this repo

## Task list
- Whenever the user gives a list of points to update, write them to `Task list.md` in the repo root before starting
  (newest list at the top, under a dated heading, one line per point, in the user's own order and wording, shortened).
  A single request counts as a one-point list.
- When a point is done, put a ✅ at the start of its line. A point that is skipped, partly done or blocked gets ⚠️ or
  ❌ and a short reason after it, so the user can see at a glance which points may have been skipped.
- Add what proves it after a done point: the commit hash, tests run, "applied to Supabase", "deployed", or
  "not committed yet" / "not tried in a browser".
- Update the file as you go, not only at the end. Subagents and delegated workers (Codex, ChatGPT) given part of a
  list tick their own points.
- Heartbeat while working: write or replace your `⏳ HH:MM <agent / task> — <doing now>` line at least every
  15 minutes; turn it into ✅ / ⚠️ / ❌ when done.
- `.tasks/` plans (Workboard) stay as they are; `Task list.md` is the user's at-a-glance list and does not replace them.

## Git and deployment
- Never commit, push or deploy unless the user asks for it in that message.
- `deploy_vercel.ps1` deploys to production (Vercel). Pushes go to the remote the user names (`origin` or
  `cnttatino`); ask if it is unclear.
- Supabase project `caro-app` is the live database. Migrations and edge function deploys hit the live site at once,
  so keep migrations additive and say in `Task list.md` when one was applied.
- Never print secrets from `.env`.
