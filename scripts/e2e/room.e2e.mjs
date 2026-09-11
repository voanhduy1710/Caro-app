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
const PORT = Number(process.env.CDP_PORT || 9334);
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
  const ctx = { label, sessionId, targetId };
  if (!(await waitFor(ctx, 'Boolean(window.__caro && window.__caro.get)', 20000))) {
    throw new Error(`${label}: window.__caro is missing; is this a dev build?`);
  }
  return ctx;
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

const settings = '{ boardSize: 15, totalTimeMinutes: 5, turnTimeSeconds: 30, allowUndo: true }';

try {
  const A = await openContext('A');
  const B = await openContext('B');
  const C = await openContext('C');
  const D = await openContext('D', 390, 844);

  // ------------------------------------------------ auto-seat and auto-start
  await act(A, `createRoom({ isPublic: true, settings: ${settings} })`);
  check('host room connects', await waitFor(A, `${S}.status === 'connected'`, 20000));
  const roomId = (await get(A)).state.roomId;
  await shot(A, 'waiting-host');
  const waitingText = await text(A);
  check('waiting room has no Ready or Start', !/I'm ready|Start match/.test(waitingText) && waitingText.includes('The game starts by itself'));

  await act(B, `joinRoom(${JSON.stringify(roomId)})`);
  check('second joiner is welcomed', await waitFor(B, `${S}.status === 'connected'`, 25000));
  check('the game starts by itself', await waitFor(A, `${S}.state.phase === 'playing'`, 8000));
  let a = await get(A);
  const b = await get(B);
  check('host sits in X, joiner in O', a.mySeat === 'X' && b.mySeat === 'O', `${a.mySeat}/${b.mySeat}`);
  check('two guests are told apart', a.state.members[0].profile.name !== a.state.members[1].profile.name, a.state.members.map((m) => m.profile.name).join(' vs '));

  // ------------------------------------------------ viewers
  await act(C, `joinRoom(${JSON.stringify(roomId)})`);
  check('a late joiner watches', await waitFor(C, `${S}.status === 'connected' && ${S}.mySeat === null`, 25000));
  await act(C, 'move(1, 1)');
  check('a viewer cannot move', (await get(C)).state.game.moves.length === 0);
  await act(C, "sendChat('hi from C')");
  const cId = (await get(C)).memberId;
  check('a viewer chats with the players', await waitFor(A, `${S}.chatMessages.some((m) => m.text === 'hi from C' && m.senderId === ${JSON.stringify(cId)})`, 5000) &&
    await waitFor(B, `${S}.chatMessages.some((m) => m.text === 'hi from C')`, 5000));
  check('a viewer has no buzz button', !(await ev(C, "Boolean(document.querySelector('[aria-label=\"Buzz the other player\"]'))")));

  // ------------------------------------------------ the tease
  await act(A, `tease(${JSON.stringify(cId)})`);
  check('the teased viewer gets the toast', await waitFor(C, "document.body.innerText.includes('Giỏi thì đánh đi')", 5000));
  check('everyone gets the chat line', await waitFor(B, `${S}.chatMessages.some((m) => m.system && m.text.includes('Giỏi thì đánh đi'))`, 5000));
  await act(A, `tease(${JSON.stringify(cId)})`);
  await sleep(300);
  check('a second tease is cooled down', (await get(A)).lastRejected?.reason === 'cooldown');

  // ------------------------------------------------ moves
  await act(B, 'move(7, 7)');
  await act(A, 'move(7, 3)');
  check('a move lands everywhere', await waitFor(C, `${S}.state.game.moves.length === 1 && ${S}.state.game.turn === 'O'`, 5000));
  await act(B, 'move(0, 0)');
  await waitFor(A, `${S}.state.game.moves.length === 2`, 5000);
  await act(A, 'move(7, 4)');
  await waitFor(B, `${S}.state.game.moves.length === 3`, 5000);

  // ------------------------------------------------ stand up, take over
  await act(B, 'becomeViewer()');
  check('standing up pauses the game', await waitFor(A, `${S}.state.phase === 'paused' && ${S}.state.seats.O === null`, 5000));
  const c1 = await ev(A, 'JSON.stringify(window.__caro.get().state.game.clocks)');
  await sleep(2000);
  const c2 = await ev(A, 'JSON.stringify(window.__caro.get().state.game.clocks)');
  check('the clocks stay frozen while paused', c1 === c2);
  check('a viewer is told the seat is open', await waitFor(C, "document.body.innerText.includes('Seat O is open')", 5000));
  await act(B, `tease(${JSON.stringify(cId)})`);
  check('the tease toast offers the free seat', await waitFor(C, "[...document.querySelectorAll('.tease-toast button')].some((b) => b.innerText.includes('Take seat O'))", 5000));
  await ev(C, "[...document.querySelectorAll('.tease-toast button')].find((b) => b.innerText.includes('Take seat O')).click()");
  check('the viewer sits and the game resumes', await waitFor(A, `${S}.state.phase === 'playing' && ${S}.state.seats.O === ${JSON.stringify(cId)}`, 8000));
  a = await get(A);
  check('the position is kept', a.state.game.moves.length === 3 && a.state.game.turn === 'O');
  check('the seat log records the handoff', a.state.game.seatLog.map((s) => s.reason).join(',') === 'stood,sat', a.state.game.seatLog.map((s) => s.reason).join(','));
  await act(B, "takeSeat('O')");
  await sleep(300);
  check('who stood up cannot sit back in this game', ['seat_taken', 'gave_up_seat'].includes((await get(B)).lastRejected?.reason));

  // ------------------------------------------------ take-back
  await act(C, 'move(0, 1)');
  await waitFor(A, `${S}.state.game.moves.length === 4`, 5000);
  await act(C, 'requestUndo()');
  check('an instant take-back', await waitFor(A, `${S}.state.game.moves.length === 3 && ${S}.state.game.turn === 'O'`, 5000));
  await act(C, 'move(0, 1)');
  await waitFor(A, `${S}.state.game.moves.length === 4`, 5000);

  // ------------------------------------------------ discovery
  check('the lobby lists the room with its viewers', await waitFor(D, `document.body.innerText.includes(${JSON.stringify(roomId)}) && document.body.innerText.includes('watching')`, 12000));

  // ------------------------------------------------ refreshes
  await cdp('Page.reload', {}, C.sessionId);
  check('a refreshing player pauses the game', await waitFor(A, `${S}.state.phase === 'paused'`, 8000));
  check('the player comes back to the same seat', await waitFor(C, `window.__caro && ${S}.status === 'connected' && ${S}.memberId === ${JSON.stringify(cId)} && ${S}.mySeat === 'O'`, 25000));
  check('the game resumes', await waitFor(A, `${S}.state.phase === 'playing'`, 8000));

  await cdp('Page.reload', {}, A.sessionId);
  check('members see the host drop', await waitFor(C, `${S}.status === 'host_lost' || ${S}.state.phase === 'paused'`, 15000));
  check('the host restores the room', await waitFor(A, `window.__caro && ${S}.status === 'connected' && ${S}.state && ${S}.state.game && ${S}.state.game.moves.length === 4`, 40000));
  check('play resumes once the host is back', await waitFor(C, `${S}.status === 'connected' && ${S}.state.phase === 'playing'`, 40000));
  a = await get(A);
  check('seats and rules survive the host refresh', a.state.seats.O === cId && a.state.isPublic === true && a.state.settings.turnTimeSeconds === 30);

  // ------------------------------------------------ result and rematch
  await act(C, 'resign()');
  check('a resignation ends the game', await waitFor(A, `${S}.state.phase === 'ended'`, 5000));
  a = await get(A);
  const last = a.state.results[a.state.results.length - 1];
  check('X wins by resignation, unrated between guests', last.winner === 'X' && last.reason === 'resigned' && last.rating.status === 'unrated');
  await sleep(3500);
  check('no new game starts by itself after a result', (await get(A)).state.phase === 'ended');
  const number = a.state.game.number;
  await act(A, 'offerRematch()');
  check('only the other player is asked', await waitFor(C, "document.body.innerText.includes('Play again?')", 5000) && !(await text(B)).includes('Play again?'));
  await act(C, 'answerRematch(true)');
  check('the rematch starts a new game', await waitFor(A, `${S}.state.phase === 'playing' && ${S}.state.game.number === ${number + 1}`, 8000));

  // ------------------------------------------------ leaving and rejoining
  await act(C, 'leaveRoom()');
  check('leaving pauses at once', await waitFor(A, `${S}.state.phase === 'paused' && ${S}.state.seats.O === null`, 3000));
  check('the home screen offers a rejoin', await waitFor(C, "document.body.innerText.includes('You left room')", 5000));
  await clickText(C, 'Rejoin');
  check('who rejoins mid-game watches', await waitFor(C, `${S}.status === 'connected' && ${S}.mySeat === null`, 25000));

  await act(A, 'discardGame()');
  check('the host ends a paused game with no result', await waitFor(A, `${S}.state.phase === 'waiting' && ${S}.state.game === null`, 5000));

  // ------------------------------------------------ the host closes the room
  await act(A, 'leaveRoom()');
  const bClosed = await waitFor(B, `${S}.status === 'closed' && ${S}.closedReason === 'host_left'`, 5000);
  const cClosed = await waitFor(C, `${S}.status === 'closed' && ${S}.closedReason === 'host_left'`, 5000);
  check('players and viewers see the room close', bClosed && cClosed);
  check('the closed dialog shows', await waitFor(B, "document.body.innerText.includes('The room has closed')", 3000));
  const attempts = (await get(B)).connectAttempts;
  await sleep(5000);
  check('nothing retries after the room closed', (await get(B)).connectAttempts === attempts);
  check('the room leaves the lobby', await waitFor(D, `!document.body.innerText.includes(${JSON.stringify(roomId)})`, 12000));
} catch (error) {
  check('harness', false, String(error?.stack || error));
} finally {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  try {
    ws.close();
  } catch {
    // Already closed.
  }
  chrome.kill();
  process.exit(failed.length ? 1 : 0);
}
