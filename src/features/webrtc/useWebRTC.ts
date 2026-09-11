import { useState, useRef, useCallback, useEffect } from 'react';
import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import type { UserProfile } from '../auth/AuthContext';
import type { PeerMessage, WebRTCState, ChatMessage } from './types';

import { roomDiscoveryManager } from './roomDiscoveryService';
import { parseRoomCode } from './roomCode';
import { DEFAULT_ROOM_SETTINGS } from '../settings/types';

const RECONNECT_GRACE_PERIOD_SEC = 30;
const REACTION_VISIBLE_MS = 3000;
/** Data-channel payloads above this are refused so one screenshot cannot stall the match. */
const MAX_IMAGE_PAYLOAD_BYTES = 900_000;

const newMessageId = () => Math.random().toString(36).substring(2, 9);

const hasSavedActiveMatch = (roomId: string) => {
  try {
    const saved = sessionStorage.getItem('caro_game_snapshot');
    if (!saved) return false;
    const snapshot = JSON.parse(saved);
    return snapshot.roomId === roomId && snapshot.gameStatus === 'playing';
  } catch {
    return false;
  }
};

export const useWebRTC = (currentUser: UserProfile | null) => {
  const [state, setState] = useState<WebRTCState>({
    roomId: null,
    isHost: false,
    isConnected: false,
    isConnecting: false,
    peerLeft: false,
    isReconnecting: false,
    reconnectTimeLeft: RECONNECT_GRACE_PERIOD_SEC,
    connectionTimedOut: false,
    peerUser: null,
    error: null,
  });

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [lastReaction, setLastReaction] = useState<{ emoji: string; sender: string } | null>(null);

  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const guestReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isReconnectingRef = useRef(false);
  const isHostRef = useRef(false);
  const connectToHostRef = useRef<(() => void) | null>(null);
  /** Set when the peer announced its exit, so the dropout timer stays off. */
  const peerLeftRef = useRef(false);
  const reactionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageListenersRef = useRef<Array<(msg: PeerMessage) => void>>([]);

  const registerMessageListener = useCallback((listener: (msg: PeerMessage) => void) => {
    messageListenersRef.current.push(listener);
    return () => {
      messageListenersRef.current = messageListenersRef.current.filter((l) => l !== listener);
    };
  }, []);

  const sendMessage = useCallback((msg: PeerMessage) => {
    if (connRef.current && connRef.current.open) {
      connRef.current.send(msg);
    } else {
      console.warn('WebRTC DataChannel not open. Cannot send message:', msg);
    }
  }, []);

  const clearError = useCallback(() => {
    setState((prev) => (prev.error ? { ...prev, error: null } : prev));
  }, []);

  const handleDisconnection = useCallback(() => {
    // Someone who pressed "Leave room" is not coming back; holding their seat
    // open for 30 seconds would only stall the player who stayed.
    if (peerLeftRef.current) return;
    if (isReconnectingRef.current) return;
    isReconnectingRef.current = true;
    setState((prev) => {
      return {
        ...prev,
        isConnected: false,
        isReconnecting: true,
        reconnectTimeLeft: RECONNECT_GRACE_PERIOD_SEC,
      };
    });

    if (reconnectTimerRef.current) clearInterval(reconnectTimerRef.current);

    reconnectTimerRef.current = setInterval(() => {
      setState((prev) => {
        if (prev.reconnectTimeLeft <= 1) {
          if (reconnectTimerRef.current) clearInterval(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
          return {
            ...prev,
            isReconnecting: false,
            reconnectTimeLeft: 0,
            connectionTimedOut: true,
            error: 'Connection lost. Match ended due to timeout.',
          };
        }
        return { ...prev, reconnectTimeLeft: prev.reconnectTimeLeft - 1 };
      });
    }, 1000);

    // A guest keeps trying the host's stable room ID while the grace period is active.
    // This makes a host refresh recover without the guest needing to refresh too.
    if (!isHostRef.current) {
      const retry = () => {
        if (!isReconnectingRef.current) return;
        connectToHostRef.current?.();
        guestReconnectTimerRef.current = setTimeout(retry, 1000);
      };
      guestReconnectTimerRef.current = setTimeout(retry, 1000);
    }
  }, []);

  const setupConnection = useCallback((conn: DataConnection) => {
    connRef.current = conn;

    conn.on('open', () => {
      console.info('PeerJS DataChannel open!');
      if (reconnectTimerRef.current) {
        clearInterval(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (guestReconnectTimerRef.current) {
        clearTimeout(guestReconnectTimerRef.current);
        guestReconnectTimerRef.current = null;
      }
      isReconnectingRef.current = false;
      peerLeftRef.current = false;
      setState((prev) => ({
        ...prev,
        isConnected: true,
        isConnecting: false,
        peerLeft: false,
        isReconnecting: false,
        reconnectTimeLeft: RECONNECT_GRACE_PERIOD_SEC,
        connectionTimedOut: false,
        error: null,
      }));

      // Send JOIN_REQUEST / user profile sync
      if (currentUser) {
        conn.send({
          type: 'JOIN_REQUEST',
          payload: { player: currentUser },
        });
      }
      // The host is authoritative after a reconnect. Request its complete board state
      // explicitly instead of relying on this browser's session snapshot.
      conn.send({ type: 'GAME_STATE_REQUEST', payload: {} });
    });

    conn.on('data', (data: any) => {
      const msg = data as PeerMessage;
      
      // Handle internal protocol messages
      if (msg.type === 'JOIN_REQUEST') {
        setState((prev) => ({ ...prev, peerUser: msg.payload.player }));
      } else if (msg.type === 'CHAT') {
        setChatMessages((prev) => [...prev, msg.payload]);
      } else if (msg.type === 'REACTION') {
        setLastReaction(msg.payload);
        if (reactionTimeoutRef.current) clearTimeout(reactionTimeoutRef.current);
        reactionTimeoutRef.current = setTimeout(() => setLastReaction(null), REACTION_VISIBLE_MS);
      } else if (msg.type === 'LEAVE_ROOM') {
        // A deliberate exit. Report it as such instead of running the dropout
        // countdown, which would end in a forfeit nobody asked for.
        peerLeftRef.current = true;
        if (reconnectTimerRef.current) {
          clearInterval(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
        if (guestReconnectTimerRef.current) {
          clearTimeout(guestReconnectTimerRef.current);
          guestReconnectTimerRef.current = null;
        }
        isReconnectingRef.current = false;
        setState((prev) => ({
          ...prev,
          isConnected: false,
          isConnecting: false,
          isReconnecting: false,
          connectionTimedOut: false,
          peerLeft: true,
          peerUser: null,
        }));
      } else if (msg.type === 'BUZZ') {
        const buzzMsg: ChatMessage = {
          id: newMessageId(),
          senderId: msg.payload?.senderId,
          sender: msg.payload?.sender || 'Opponent',
          text: '🔔 BUZZ!',
          timestamp: Date.now(),
          system: true,
        };
        setChatMessages((prev) => [...prev, buzzMsg]);
      }

      // Notify external subscribers (e.g. Game Engine)
      messageListenersRef.current.forEach((listener) => listener(msg));
    });

    conn.on('close', () => {
      console.warn('Peer connection closed.');
      if (connRef.current !== conn) return;
      handleDisconnection();
    });

    conn.on('error', (err) => {
      console.error('Peer connection error:', err);
      if (connRef.current !== conn) return;
      handleDisconnection();
    });
  }, [currentUser, handleDisconnection]);

  const clearChat = useCallback(() => {
    setChatMessages([]);
  }, []);

  // Create Room (Host)
  const createRoom = useCallback((roomCode?: string, boardSize = DEFAULT_ROOM_SETTINGS.boardSize, isPublic: boolean = true) => {
    setChatMessages([]);
    peerLeftRef.current = false;
    setState((prev) => ({ ...prev, isConnecting: true, peerLeft: false, error: null }));
    const code = roomCode || Math.random().toString(36).substring(2, 8).toUpperCase();
    const peerId = `caro_room_${code}`;
    isHostRef.current = true;
    isReconnectingRef.current = false;

    // Update URL & SessionStorage for smooth F5 reconnection
    try {
      window.history.replaceState(null, '', `?room=${code}`);
      sessionStorage.setItem('caro_active_session', JSON.stringify({ roomId: code, isHost: true }));
    } catch {
      // ignore
    }

    if (peerRef.current) peerRef.current.destroy();

    const peer = new Peer(peerId, {
      debug: 1,
    });

    peerRef.current = peer;

    peer.on('open', (id) => {
      console.info('PeerJS host registered with ID:', id);
      setState({
        roomId: code,
        isHost: true,
        isConnected: false,
        isConnecting: true,
        peerLeft: false,
        isReconnecting: false,
        reconnectTimeLeft: RECONNECT_GRACE_PERIOD_SEC,
        connectionTimedOut: false,
        peerUser: null,
        error: null,
      });
      if (isPublic) {
        roomDiscoveryManager.startHostingRoom(code, currentUser, boardSize);
      }
      // After a refresh, resume the grace window until the other player reconnects.
      if (hasSavedActiveMatch(code)) handleDisconnection();
    });

    peer.on('connection', (conn) => {
      // A room seats exactly two players. Without this guard a third browser could
      // connect mid-match, replace the active data channel and hijack the game.
      if (connRef.current && connRef.current.open && connRef.current.peer !== conn.peer) {
        console.warn('Rejecting extra peer connection; room already has two players.');
        conn.on('open', () => conn.close());
        return;
      }
      console.info('Incoming peer connection request from guest');
      setupConnection(conn);
      roomDiscoveryManager.stopHostingRoom(code);
    });

    peer.on('error', (err) => {
      console.error('Host PeerJS Error:', err);
      setState((prev) => ({
        ...prev,
        isConnecting: false,
        error: `Could not open the room. ${err.message}`,
      }));
      roomDiscoveryManager.stopHostingRoom(code);
    });
  }, [currentUser, setupConnection]);

  // Join Room (Guest)
  const joinRoom = useCallback((roomCode: string): string | null => {
    const code = parseRoomCode(roomCode);
    if (!code) {
      setState((prev) => ({
        ...prev,
        isConnecting: false,
        error: 'That does not look like a room code. Enter the code your friend sent, or paste their invite link.',
      }));
      return null;
    }
    setChatMessages([]);
    const hostPeerId = `caro_room_${code}`;
    isHostRef.current = false;
    isReconnectingRef.current = false;
    peerLeftRef.current = false;
    setState((prev) => ({ ...prev, isConnecting: true, peerLeft: false, error: null }));

    // Update URL & SessionStorage for smooth F5 reconnection
    try {
      window.history.replaceState(null, '', `?room=${code}`);
      sessionStorage.setItem('caro_active_session', JSON.stringify({ roomId: code, isHost: false }));
    } catch {
      // ignore
    }

    if (peerRef.current) peerRef.current.destroy();

    const peer = new Peer({ debug: 1 });
    peerRef.current = peer;

    peer.on('open', (id) => {
      console.info('Guest PeerJS initialized with ID:', id);
      const connectToHost = () => {
        if (peer.destroyed) return;
        // The retry loop runs once a second for the whole grace window. Drop the
        // previous half-open attempt so 30 dead connections do not pile up.
        const previous = connRef.current;
        if (previous && !previous.open) {
          try {
            previous.close();
          } catch {
            // Already torn down.
          }
        }
        const conn = peer.connect(hostPeerId, { reliable: true });
        setupConnection(conn);
      };
      connectToHostRef.current = connectToHost;
      connectToHost();

      setState({
        roomId: code,
        isHost: false,
        isConnected: false,
        isConnecting: true,
        peerLeft: false,
        isReconnecting: false,
        reconnectTimeLeft: RECONNECT_GRACE_PERIOD_SEC,
        connectionTimedOut: false,
        peerUser: null,
        error: null,
      });
      // A refreshed guest must not let local clocks run before the host has restored the channel.
      if (hasSavedActiveMatch(code)) handleDisconnection();
    });

    peer.on('error', (err) => {
      console.error('Guest PeerJS Join Error:', err);
      // `peer-unavailable` is by far the most common failure and means the code
      // is wrong or the host closed the room. Say that, not the raw error.
      const isMissingRoom = (err as { type?: string }).type === 'peer-unavailable';
      setState((prev) => ({
        ...prev,
        isConnecting: false,
        error: isMissingRoom
          ? `Room ${code} is not open. Check the code with your friend, or ask them to create the room again.`
          : `Could not join room ${code}. ${err.message}`,
      }));
    });

    return code;
  }, [setupConnection]);

  useEffect(() => () => {
    if (reconnectTimerRef.current) clearInterval(reconnectTimerRef.current);
    if (guestReconnectTimerRef.current) clearTimeout(guestReconnectTimerRef.current);
    if (reactionTimeoutRef.current) clearTimeout(reactionTimeoutRef.current);
  }, []);

  const sendChat = useCallback((text: string, image?: string) => {
    if (!currentUser) return;
    const trimmedText = text.trim();
    if (!trimmedText && !image) return;

    if (image && image.length > MAX_IMAGE_PAYLOAD_BYTES) {
      setChatMessages((prev) => [...prev, {
        id: newMessageId(),
        sender: 'System',
        text: 'That image is too large to send. Try a smaller screenshot.',
        timestamp: Date.now(),
        system: true,
      }]);
      return;
    }

    const msg: ChatMessage = {
      id: newMessageId(),
      senderId: currentUser.uid,
      sender: currentUser.displayName,
      text: trimmedText,
      ...(image ? { image } : {}),
      timestamp: Date.now(),
    };
    sendMessage({ type: 'CHAT', payload: msg });
    setChatMessages((prev) => [...prev, msg]);
  }, [currentUser, sendMessage]);

  const sendReaction = useCallback((emoji: string) => {
    if (!currentUser) return;
    const payload = { emoji, sender: currentUser.displayName };
    sendMessage({ type: 'REACTION', payload });
    setLastReaction(payload);
    if (reactionTimeoutRef.current) clearTimeout(reactionTimeoutRef.current);
    reactionTimeoutRef.current = setTimeout(() => setLastReaction(null), REACTION_VISIBLE_MS);
  }, [currentUser, sendMessage]);

  const sendBuzz = useCallback(() => {
    if (!currentUser) return;
    sendMessage({ type: 'BUZZ', payload: { sender: currentUser.displayName, senderId: currentUser.uid } });
    const msg: ChatMessage = {
      id: newMessageId(),
      senderId: currentUser.uid,
      sender: currentUser.displayName,
      text: '🔔 BUZZ!',
      timestamp: Date.now(),
      system: true,
    };
    setChatMessages((prev) => [...prev, msg]);
  }, [currentUser, sendMessage]);

  const leaveRoom = useCallback(() => {
    if (state.roomId) {
      roomDiscoveryManager.stopHostingRoom(state.roomId);
    }
    // Announce the exit before tearing the channel down, so the other player
    // sees "opponent left" rather than a 30-second reconnect countdown.
    if (connRef.current && connRef.current.open) {
      try {
        connRef.current.send({ type: 'LEAVE_ROOM', payload: {} });
      } catch {
        // The channel is already gone; nothing to announce.
      }
    }
    peerLeftRef.current = false;
    if (connRef.current) connRef.current.close();
    if (peerRef.current) peerRef.current.destroy();
    if (reconnectTimerRef.current) clearInterval(reconnectTimerRef.current);
    if (guestReconnectTimerRef.current) clearTimeout(guestReconnectTimerRef.current);
    isReconnectingRef.current = false;
    connectToHostRef.current = null;

    // Clean up URL & SessionStorage
    try {
      window.history.replaceState(null, '', window.location.pathname);
      sessionStorage.removeItem('caro_active_session');
      sessionStorage.removeItem('caro_game_snapshot');
    } catch {
      // ignore
    }

    setState({
      roomId: null,
      isHost: false,
      isConnected: false,
      isConnecting: false,
      peerLeft: false,
      isReconnecting: false,
      reconnectTimeLeft: RECONNECT_GRACE_PERIOD_SEC,
      connectionTimedOut: false,
      peerUser: null,
      error: null,
    });
    setChatMessages([]);
  }, [state.roomId]);

  return {
    ...state,
    chatMessages,
    lastReaction,
    createRoom,
    joinRoom,
    leaveRoom,
    clearChat,
    clearError,
    sendMessage,
    sendChat,
    sendReaction,
    sendBuzz,
    registerMessageListener,
  };
};
