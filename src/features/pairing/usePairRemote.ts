/**
 * The phone side of a pairing. The phone joins the pairing's private channel,
 * says hello with the QR's one-time secret, then renders the desktop's
 * snapshots and sends every action back as a call. It never runs a game of
 * its own: the desktop stays authoritative.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PracticeMatchViewProps } from '../../app/PracticeMatchView';
import type { UserProfile } from '../auth/AuthContext';
import type { RoomApi } from '../room/useRoomCore';
import { cryptoEnv } from '../room/roomEngineCore';
import { openPairChannel, type PairChannel } from './pairChannel';
import type { PairError } from './pairErrors';
import type { PairOffer } from './pairLink';
import {
  applyDesktopMessage,
  failConnecting,
  HANDSHAKE_TIMEOUT_MS,
  INITIAL_REMOTE_STATE,
  isDesktopSilent,
  maskDismissed,
  NOTHING_DISMISSED,
  PING_INTERVAL_MS,
  type DismissedNotices,
  type RemoteStatus,
} from './pairRemoteSync';
import { createRemotePracticeProps, type PracticeSnapshot } from './practiceSnapshot';
import { createRemoteRoomApi, type RoomSnapshot } from './roomSnapshot';

export interface PairRemote {
  status: RemoteStatus;
  error: PairError | null;
  endReason: string | null;
  kind: 'room' | 'practice' | null;
  room: RoomApi | null;
  practice: PracticeMatchViewProps | null;
  unpair(): void;
}

const noop = () => {};

export const usePairRemote = (offer: PairOffer, user: UserProfile): PairRemote => {
  const [phoneId] = useState(() => cryptoEnv.randomToken());
  const [state, setState] = useState(INITIAL_REMOTE_STATE);
  const [dismissed, setDismissed] = useState<DismissedNotices>(NOTHING_DISMISSED);
  const channelRef = useRef<PairChannel | null>(null);
  const lastHeardRef = useRef(0);

  const { uid, sessionId, secret } = offer;
  useEffect(() => {
    // The secret works once, so a channel that re-joins never says hello again.
    let helloSent = false;
    const channel: PairChannel = openPairChannel(
      uid,
      sessionId,
      (m) => {
        if (m.phoneId !== phoneId) return;
        lastHeardRef.current = Date.now();
        const at = performance.now();
        setState((s) => applyDesktopMessage(s, m, phoneId, at));
      },
      (status) => {
        if (status === 'error') setState(failConnecting);
        else if (!helloSent) {
          helloSent = true;
          channel.send({ t: 'hello', phoneId, secret });
        }
      },
    );
    channelRef.current = channel;
    const handshake = window.setTimeout(() => setState(failConnecting), HANDSHAKE_TIMEOUT_MS);
    return () => {
      window.clearTimeout(handshake);
      channel.close();
      if (channelRef.current === channel) channelRef.current = null;
    };
  }, [uid, sessionId, secret, phoneId]);

  // While paired: ping the desktop, and give up on one that has gone quiet.
  const paired = state.status === 'paired';
  useEffect(() => {
    if (!paired) return;
    lastHeardRef.current = Math.max(lastHeardRef.current, Date.now());
    const ping = window.setInterval(() => channelRef.current?.send({ t: 'ping', phoneId }), PING_INTERVAL_MS);
    const watch = window.setInterval(() => {
      if (isDesktopSilent(lastHeardRef.current, Date.now())) {
        setState((s) => (s.status === 'paired' ? { ...s, status: 'ended', endReason: 'desktop_closed' } : s));
      }
    }, 1000);
    return () => {
      window.clearInterval(ping);
      window.clearInterval(watch);
    };
  }, [paired, phoneId]);

  // Once the pairing is over the channel has nothing left to carry.
  const over = state.status === 'ended' || state.status === 'error';
  useEffect(() => {
    if (!over) return;
    channelRef.current?.close();
    channelRef.current = null;
  }, [over]);

  const call = useCallback((method: string, args: unknown[]) => {
    channelRef.current?.send({ t: 'call', phoneId, method, args });
  }, [phoneId]);

  const unpair = useCallback(() => {
    channelRef.current?.send({ t: 'bye', phoneId });
    channelRef.current?.close();
    channelRef.current = null;
    setState((s) => (s.status === 'ended' || s.status === 'error' ? s : { ...s, status: 'ended', endReason: 'unpaired' }));
  }, [phoneId]);

  const { kind, data, receivedAt, images } = state;
  const remoteRoom = useMemo(
    () => (paired && kind === 'room' ? createRemoteRoomApi(data as RoomSnapshot, receivedAt, images, call, { leaveRoom: unpair }) : null),
    [paired, kind, data, receivedAt, images, call, unpair],
  );
  const room = useMemo<RoomApi | null>(() => {
    if (!remoteRoom) return null;
    return {
      ...maskDismissed(remoteRoom, dismissed),
      dismissTease: () => setDismissed((d) => ({ ...d, teaseAt: remoteRoom.teaseNotice?.at ?? d.teaseAt })),
      dismissSeatOpened: () => setDismissed((d) => ({ ...d, seatOpenedAt: remoteRoom.seatOpened?.at ?? d.seatOpenedAt })),
      clearError: () => setDismissed((d) => ({ ...d, error: remoteRoom.error ?? d.error })),
    };
  }, [remoteRoom, dismissed]);

  const practice = useMemo(
    () => (paired && kind === 'practice'
      ? createRemotePracticeProps(data as PracticeSnapshot, call, { user, openProfileModal: noop, setOpponent: noop, onExit: unpair })
      : null),
    [paired, kind, data, call, user, unpair],
  );

  return { status: state.status, error: state.error, endReason: state.endReason, kind, room, practice, unpair };
};
