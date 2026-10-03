// Reconnect end-to-end (focused): host refresh, host reopening the link in a
// new tab, and the host going offline. Based on room.e2e.mjs.
//
// Room end-to-end: several isolated browser contexts in one headless Chrome,
// driving the app through window.__caro (dev builds only) and checking the DOM.
//
//   npm run dev          (serves http://localhost:5175)
//   npm run e2e:room     (needs Chrome and internet access for PeerJS signalling)
//
// Every context has its own storage, so each is a different guest. Nothing here
// touches the rating server: guests are never rated.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = Number(process.env.CDP_PORT || 9335);
const APP = process.env.APP_URL || 'http://localhost:5175';
const OUT = process.env.SHOT_DIR || tmpdir();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profileDir = mkdtempSync(join(tmpdir(), 'caro-e2e-'));
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profileDir}`,
  // Keeps local ICE candidates resolvable in headless mode.
  '--disable-features=WebRtcHideLocalIpsWithMdns',
  '--autoplay-policy=no-user-gesture-required',
  // Every tab here stands for a separate player's foreground window; headless
  // Chrome would otherwise throttle the background ones to a crawl.
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  '--no-first-run',
  '--no-default-browser-check',
  'about:blank',
], { stdio: 'ignore' });

let wsUrl = null;
for (let i = 0; i < 50 && !wsUrl; i += 1) {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
    wsUrl = (await res.json()).webSocketDebuggerUrl;
  } catch {
    await sleep(200);
  }
}
if (!wsUrl) throw new Error('Chrome did not start');

const ws = new WebSocket(wsUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});
let nextId = 1;
const waiting = new Map();
// A lost DevTools socket would leave every pending call hanging and Node
// would exit mid-run with no result; fail them loudly instead.
ws.onclose = () => {
  for (const { reject } of waiting.values()) reject(new Error('Chrome DevTools connection closed'));
  waiting.clear();
};
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && waiting.has(msg.id)) {
    const { resolve, reject } = waiting.get(msg.id);
    waiting.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  }
};
const cdp = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    waiting.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const ev = async (ctx, expression) => {
  const res = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, ctx.sessionId);
  if (res.exceptionDetails) throw new Error(`${ctx.label}: ${res.exceptionDetails.exception?.description || res.exceptionDetails.text}`);
  return res.result.value;
};

async function waitFor(ctx, expression, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      if (await ev(ctx, `(() => { try { return Boolean(${expression}); } catch { return false; } })()`)) return true;
    } catch {
      // The page may be navigating.
    }
    await sleep(200);
  }
  return false;
}

const openContext = async (label, width = 1440, height = 900) => {
  const { browserContextId } = await cdp('Target.createBrowserContext', { disposeOnDetach: true });
  const { targetId } = await cdp('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true });
  await cdp('Runtime.enable', {}, sessionId);
  await cdp('Page.enable', {}, sessionId);
  await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 }, sessionId);
  await cdp('Page.navigate', { url: APP }, sessionId);
  const ctx = { label, sessionId, targetId, browserContextId };
  if (!(await waitFor(ctx, 'Boolean(window.__caro && window.__caro.get)', 20000))) {
    throw new Error(`${label}: window.__caro is missing; is this a dev build?`);
  }
  return ctx;
};

/** Closes a context's tab and opens a new one in the same browser profile, as a player reopening a link does. */
const reopenTab = async (ctx, url) => {
  await cdp('Target.closeTarget', { targetId: ctx.targetId });
  const { targetId } = await cdp('Target.createTarget', { url: 'about:blank', browserContextId: ctx.browserContextId });
  const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true });
  await cdp('Runtime.enable', {}, sessionId);
  await cdp('Page.enable', {}, sessionId);
  await cdp('Page.navigate', { url }, sessionId);
  Object.assign(ctx, { sessionId, targetId });
  return waitFor(ctx, 'Boolean(window.__caro && window.__caro.get)', 20000);
};

const setOffline = async (ctx, offline) => {
  await cdp('Network.enable', {}, ctx.sessionId);
  await cdp('Network.emulateNetworkConditions', { offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }, ctx.sessionId);
};

const get = (ctx) => ev(ctx, 'JSON.parse(JSON.stringify(window.__caro.get()))');
const act = (ctx, call) => ev(ctx, `(async () => { const r = await window.__caro.act.${call}; return r === undefined ? null : r; })()`);
const text = (ctx) => ev(ctx, 'document.body.innerText');
const S = 'window.__caro.get()';
const shot = async (ctx, name) => {
  const { data } = await cdp('Page.captureScreenshot', { format: 'png' }, ctx.sessionId);
  writeFileSync(join(OUT, `e2e-${name}.png`), Buffer.from(data, 'base64'));
};
const clickText = (ctx, label) =>
  ev(ctx, `(() => { const b = [...document.querySelectorAll('button')].find((el) => el.innerText.trim() === ${JSON.stringify(label)} && !el.disabled); if (!b) return false; b.click(); return true; })()`);

const settings = '{ boardSize: 15, totalTimeMinutes: 0, turnTimeSeconds: 0, allowUndo: true }';

try {
  const A = await openContext('A');
  const B = await openContext('B');

  // Private, so nobody from the live lobby wanders in.
  await act(A, `createRoom({ isPublic: false, settings: ${settings} })`);
  check('host room connects', await waitFor(A, `${S}.status === 'connected'`, 20000));
  const roomId = (await get(A)).state.roomId;
  await act(B, `joinRoom(${JSON.stringify(roomId)})`);
  check('player joins', await waitFor(B, `${S}.status === 'connected'`, 25000));
  check('game starts', await waitFor(A, `${S}.state.phase === 'playing'`, 8000));
  const turnSeat = (await get(A)).state.game.turn;
  const mover = (await get(A)).mySeat === turnSeat ? A : B;
  await act(mover, 'move(7, 7)');
  check('a move lands', await waitFor(B, `${S}.state.game.moves.length === 1`, 5000) && await waitFor(A, `${S}.state.game.moves.length === 1`, 5000));
  const hostId = (await get(A)).memberId;
  const bId = (await get(B)).memberId;
  const same = `${S}.state && ${S}.state.game && ${S}.state.game.moves.length === 1`;
  const back = (label, ms) => waitFor(B, `${S}.status === 'connected' && ${S}.memberId === ${JSON.stringify(bId)} && ${S}.state.phase === 'playing' && ${same}`, ms);

  // 1. Host refresh (sessionStorage survives).
  await cdp('Page.reload', {}, A.sessionId);
  check('1. host refresh: room restored', await waitFor(A, `window.__caro && ${S}.status === 'connected' && ${S}.memberId === ${JSON.stringify(hostId)} && ${same}`, 60000));
  check('1. host refresh: player back, game playing', await back('refresh', 60000));

  // 2. Host closes the tab and opens the link in a new one (sessionStorage gone).
  check('2. reopened tab loads', await reopenTab(A, `${APP}/?room=${roomId}`));
  check('2. new tab: host takes the room back', await waitFor(A, `${S}.status === 'connected' && ${S}.memberId === ${JSON.stringify(hostId)} && ${same}`, 90000), JSON.stringify(await get(A).then((g) => ({ status: g.status, memberId: g.memberId, moves: g.state?.game?.moves?.length })).catch(() => null)));
  check('2. new tab: player back, game playing', await back('reopen', 90000));

  // 3. Host network drops for 10 s.
  await ev(A, 'window.__beforeOffline = true');
  await setOffline(A, true);
  await sleep(10000);
  await setOffline(A, false);
  await sleep(2000);
  check('3. diag: host page was NOT reloaded by the outage', await ev(A, 'window.__beforeOffline === true'));
  check('3. offline: room survives on the host', await waitFor(A, `${S}.status === 'connected' && ${same}`, 60000), JSON.stringify(await get(A).then((g) => ({ status: g.status, error: g.closedReason })).catch(() => null)));
  check('3. offline: player back, game playing', await back('offline', 90000));
  {
    const g = await get(A);
    const who = g.state.game.turn === g.mySeat ? A : B;
    const sent = await act(who, 'move(0, 0)');
    const ok = await waitFor(A, `${S}.state.game.moves.length === 2`, 8000) && await waitFor(B, `${S}.state.game.moves.length === 2`, 8000);
    const a2 = await get(A); const b2 = await get(B); const w2 = who === A ? a2 : b2;
    if (!ok) {
      await act(B, "sendChat('probe from B')");
      const chatOk = await waitFor(A, `${S}.chatMessages.some((m) => m.text === 'probe from B')`, 8000);
      const late = await waitFor(A, `${S}.state.game.moves.length === 2`, 10000);
      const bInfo = await ev(B, 'JSON.stringify({ attempts: window.__caro.get().connectAttempts, rejected: window.__caro.get().lastRejected, mySeat: window.__caro.get().mySeat, turn: window.__caro.get().state.game.turn })');
      check('3. diag: B chat reaches host', chatOk);
      check('3. diag: move arrives late', late, bInfo);
    }
    check('3. offline: play continues', ok, JSON.stringify({ mover: who.label, sent, moverRejected: w2.lastRejected, aMoves: a2.state.game.moves.length, bMoves: b2.state.game.moves.length, phase: a2.state.phase, aConns: a2.state.members.map((m) => m.connected), bStatus: b2.status }));
  }
} catch (error) {
  check('harness', false, String(error?.stack || error));
} finally {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  try { ws.close(); } catch { /* already closed */ }
  chrome.kill();
  process.exit(failed.length ? 1 : 0);
}
