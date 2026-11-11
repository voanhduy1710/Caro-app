import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../../config/supabase';
import { pairTopic, parsePairMessage, type PairMessage } from './pairProtocol';

/**
 * One pairing session's private Realtime broadcast channel. The topic is
 * `pair:<uid>:<sessionId>` and the RLS policies on realtime.messages only let
 * the signed-in owner of <uid> join it, so the phone and the desktop must be
 * signed in to the same account.
 */
export interface PairChannel {
  send(msg: PairMessage): void;
  close(): void;
}

const PAIR_EVENT = 'pair';

const noopChannel: PairChannel = {
  send: () => {},
  close: () => {},
};

export const openPairChannel = (
  uid: string,
  sessionId: string,
  onMessage: (m: PairMessage) => void,
  onStatus: (s: 'joined' | 'error') => void,
): PairChannel => {
  const client = supabase;
  if (!client) return noopChannel;

  let closed = false;
  const channel: RealtimeChannel = client.channel(pairTopic(uid, sessionId), {
    config: { private: true, broadcast: { self: false } },
  });

  channel.on('broadcast', { event: PAIR_EVENT }, ({ payload }: { payload: unknown }) => {
    if (closed) return;
    const msg = parsePairMessage(payload);
    if (msg) onMessage(msg);
  });

  // A private channel is authorised with the user's JWT, so hand the current
  // session token to Realtime before joining.
  client.realtime
    .setAuth()
    .then(() => {
      if (closed) return;
      channel.subscribe((status) => {
        if (closed) return;
        if (status === 'SUBSCRIBED') onStatus('joined');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') onStatus('error');
      });
    })
    .catch(() => {
      if (!closed) onStatus('error');
    });

  return {
    send(msg) {
      if (closed) return;
      void channel.send({ type: 'broadcast', event: PAIR_EVENT, payload: msg }).catch(() => {});
    },
    close() {
      if (closed) return;
      closed = true;
      void client.removeChannel(channel).catch(() => {});
    },
  };
};
