/**
 * The desktop side of pairing a phone to the game on screen. The desktop stays
 * authoritative: it shows a rotating QR, accepts one phone per game, pushes
 * snapshots of the game to it and runs the phone's calls through the same
 * room API or practice callbacks the desktop's own buttons use.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { UserProfile } from '../auth/AuthContext';
import { useT } from '../i18n/language';
import { cryptoEnv } from '../room/roomEngineCore';
import { openPairChannel, type PairChannel } from './pairChannel';
import { acceptHello, createHostState, dropPhone, rotateIfDue, type PairHostState } from './pairHostSession';
import {
  isPhoneSilent,
  needsTickPush,
  secondsUntilRotation,
  snapshotChangeKey,
  snapshotOf,
  unsentImages,
  type PairSource,
} from './pairHostSync';
import { encodePairLink } from './pairLink';
import type { PairEndReason, PairMessage } from './pairProtocol';
import { applyPracticeCall } from './practiceSnapshot';
import { applyRoomCall, chatImagesOf } from './roomSnapshot';

export type { PairSource } from './pairHostSync';

export interface PairHostInput {
  user: UserProfile | null;
  source: PairSource | null;
  /** Shows a short desktop notice when a phone connects or drops. */
  onNotice?: (text: string) => void;
}

export interface PairHost {
  modalOpen: boolean;
  link: string | null;
  secondsLeft: number;
  phoneConnected: boolean;
  open(): void;
  close(): void;
  unpair(): void;
}

const randomSecret = () => cryptoEnv.randomToken();

export const usePairHost = ({ user, source, onNotice }: PairHostInput): PairHost => {
  const t = useT();
  const uid = user && !user.isGuest ? user.uid : null;
  const [modalOpen, setModalOpen] = useState(false);
  const [host, setHost] = useState<PairHostState | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Channel callbacks and timers read the latest values through refs, so the
  // channel is never re-joined just because the game re-rendered.
  const hostRef = useRef<PairHostState | null>(null);
  const sourceRef = useRef(source);
  const channelRef = useRef<PairChannel | null>(null);
  const seqRef = useRef(0);
  const sentImagesRef = useRef(new Set<string>());
  const lastHeardRef = useRef(0);
  const noticeRef = useRef<(text: string) => void>(() => {});
  useEffect(() => {
    sourceRef.current = source;
    noticeRef.current = onNotice ?? (() => {});
  });

  const commitHost = useCallback((next: PairHostState | null) => {
    hostRef.current = next;
    setHost(next);
  }, []);

  const sendEnd = useCallback((reason: PairEndReason) => {
    const phoneId = hostRef.current?.phoneId;
    if (phoneId) channelRef.current?.send({ t: 'end', phoneId, reason });
  }, []);

  const pushSnapshot = useCallback(() => {
    const phoneId = hostRef.current?.phoneId;
    const src = sourceRef.current;
    const channel = channelRef.current;
    if (!phoneId || !src || !channel) return;
    // Images go first so a snapshot never points at one the phone lacks for long.
    if (src.kind === 'room') {
      for (const { id, image } of unsentImages(chatImagesOf(src.room), sentImagesRef.current)) {
        channel.send({ t: 'chatImage', phoneId, id, image });
        sentImagesRef.current.add(id);
      }
    }
    seqRef.current += 1;
    const { kind, data } = snapshotOf(src);
    channel.send({ t: 'snapshot', phoneId, seq: seqRef.current, kind, data });
  }, []);

  const handleMessage = useCallback((m: PairMessage) => {
    const state = hostRef.current;
    const src = sourceRef.current;
    if (!state || !src) return;
    const at = Date.now();

    if (m.t === 'hello') {
      // Rotation only runs while the QR is on screen; expire a stale secret here too.
      const result = acceptHello(rotateIfDue(state, at, randomSecret), m.secret, m.phoneId, at);
      if (!result.ok) {
        channelRef.current?.send({ t: 'reject', phoneId: m.phoneId, reason: result.reason });
        return;
      }
      if (result.replacedPhoneId) channelRef.current?.send({ t: 'end', phoneId: result.replacedPhoneId, reason: 'replaced' });
      commitHost(result.state);
      lastHeardRef.current = at;
      sentImagesRef.current = new Set();
      channelRef.current?.send({ t: 'welcome', phoneId: m.phoneId });
      pushSnapshot();
      noticeRef.current(t('pair.phoneConnected'));
      return;
    }

    // Anything else counts only from the phone paired right now.
    if (m.phoneId !== state.phoneId) return;
    if (m.t === 'ping') {
      lastHeardRef.current = at;
      // The answer doubles as the desktop's heartbeat: an idle game pushes
      // nothing else, and the phone gives up on a silent desktop.
      pushSnapshot();
    } else if (m.t === 'call') {
      lastHeardRef.current = at;
      if (src.kind === 'room') applyRoomCall(src.room, m.method, m.args);
      else applyPracticeCall(src.props, m.method, m.args);
    } else if (m.t === 'bye') {
      commitHost(dropPhone(state, m.phoneId));
      noticeRef.current(t('pair.phoneDisconnected'));
    }
  }, [commitHost, pushSnapshot, t]);

  /** Ends every trace of this pairing: tells the phone why, forgets the session, closes the QR. */
  const endPairing = useCallback((reason: PairEndReason) => {
    sendEnd(reason);
    commitHost(null);
    sentImagesRef.current = new Set();
    setModalOpen(false);
  }, [commitHost, sendEnd]);

  // Declared before the channel effect so that, on unmount, the phone is told
  // before the channel closes.
  useEffect(() => {
    const onUnload = () => sendEnd('desktop_closed');
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      onUnload();
    };
  }, [sendEnd]);

  const sessionId = host?.sessionId ?? null;
  const phoneConnected = Boolean(host?.phoneId);
  const channelWanted = (modalOpen || phoneConnected) && uid !== null && sessionId !== null;
  useEffect(() => {
    if (!channelWanted || !uid || !sessionId) return;
    const channel = openPairChannel(uid, sessionId, handleMessage, () => {});
    channelRef.current = channel;
    return () => {
      channel.close();
      if (channelRef.current === channel) channelRef.current = null;
    };
  }, [channelWanted, uid, sessionId, handleMessage]);

  // A pairing belongs to one game of one account: a new game, leaving it, or
  // signing out ends it.
  const pairingKey = uid && source ? `${uid}:${source.kind}:${source.gameKey}` : null;
  const prevPairingKeyRef = useRef(pairingKey);
  useEffect(() => {
    if (prevPairingKeyRef.current === pairingKey) return;
    prevPairingKeyRef.current = pairingKey;
    endPairing('game_ended');
  }, [pairingKey, endPairing]);

  // The QR's secret is replaced every minute while it is on screen.
  useEffect(() => {
    if (!modalOpen) return;
    const tick = () => {
      const state = hostRef.current;
      const at = Date.now();
      if (state) {
        const next = rotateIfDue(state, at, randomSecret);
        if (next !== state) commitHost(next);
      }
      setNow(at);
    };
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [modalOpen, commitHost]);

  // Every change the phone can see is pushed as it happens.
  const changeKey = phoneConnected && source ? snapshotChangeKey(source) : null;
  useEffect(() => {
    if (changeKey !== null) pushSnapshot();
  }, [changeKey, pushSnapshot]);

  // While paired: a fresh snapshot every second while clocks run, and a phone
  // that has gone quiet is dropped.
  useEffect(() => {
    if (!phoneConnected) return;
    const id = window.setInterval(() => {
      const state = hostRef.current;
      if (!state?.phoneId) return;
      if (isPhoneSilent(lastHeardRef.current, Date.now())) {
        commitHost(dropPhone(state, state.phoneId));
        noticeRef.current(t('pair.phoneDisconnected'));
        return;
      }
      const src = sourceRef.current;
      if (src && needsTickPush(src)) pushSnapshot();
    }, 1000);
    return () => window.clearInterval(id);
  }, [phoneConnected, commitHost, pushSnapshot, t]);

  const open = useCallback(() => {
    if (!uid || !sourceRef.current) return;
    const at = Date.now();
    if (!hostRef.current) commitHost(createHostState(at, randomSecret));
    else commitHost(rotateIfDue(hostRef.current, at, randomSecret));
    setNow(at);
    setModalOpen(true);
  }, [uid, commitHost]);

  const close = useCallback(() => setModalOpen(false), []);

  const unpair = useCallback(() => {
    const state = hostRef.current;
    if (!state?.phoneId) return;
    sendEnd('unpaired');
    commitHost(dropPhone(state, state.phoneId));
    sentImagesRef.current = new Set();
  }, [commitHost, sendEnd]);

  const sourceKind = source?.kind ?? null;
  const link = useMemo(
    () => (host && uid && sourceKind
      ? encodePairLink(window.location.origin, { v: 1, uid, sessionId: host.sessionId, secret: host.current.secret, kind: sourceKind })
      : null),
    [host, uid, sourceKind],
  );

  return {
    modalOpen,
    link,
    secondsLeft: host ? secondsUntilRotation(host, now) : 0,
    phoneConnected,
    open,
    close,
    unpair,
  };
};
