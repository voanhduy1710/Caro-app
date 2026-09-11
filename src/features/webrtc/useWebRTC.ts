import { useState, useRef, useCallback, useEffect } from 'react';
import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import type { UserProfile } from '../auth/AuthContext';
import type { PeerMessage, WebRTCState, ChatMessage } from './types';

import { roomDiscoveryManager } from './roomDiscoveryService';

const RECONNECT_GRACE_PERIOD_SEC = 30;

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

  const handleDisconnection = useCallback(() => {
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
      setState((prev) => ({
        ...prev,
        isConnected: true,
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
        setTimeout(() => setLastReaction(null), 3000);
      } else if (msg.type === 'BUZZ') {
        const buzzMsg: ChatMessage = {
          id: Math.random().toString(36).substring(2, 9),
          sender: msg.payload.sender || 'Opponent',
          text: '🔔 BUZZ!',
          timestamp: Date.now(),
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
  const createRoom = useCallback((roomCode?: string, boardSize = 50, isPublic: boolean = true) => {
    setChatMessages([]);
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
      console.info('Incoming peer connection request from guest');
      setupConnection(conn);
      roomDiscoveryManager.stopHostingRoom(code);
    });

    peer.on('error', (err) => {
      console.error('Host PeerJS Error:', err);
      setState((prev) => ({ ...prev, error: `Failed to create room: ${err.message}` }));
      roomDiscoveryManager.stopHostingRoom(code);
    });
  }, [currentUser, setupConnection]);

  // Join Room (Guest)
  const joinRoom = useCallback((roomCode: string) => {
    setChatMessages([]);
    const code = roomCode.trim().toUpperCase();
    const hostPeerId = `caro_room_${code}`;
    isHostRef.current = false;
    isReconnectingRef.current = false;

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
        const conn = peer.connect(hostPeerId, { reliable: true });
        setupConnection(conn);
      };
      connectToHostRef.current = connectToHost;
      connectToHost();

      setState({
        roomId: code,
        isHost: false,
        isConnected: false,
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
      setState((prev) => ({ ...prev, error: `Failed to join room ${code}: ${err.message}` }));
    });
  }, [setupConnection]);

  useEffect(() => () => {
    if (reconnectTimerRef.current) clearInterval(reconnectTimerRef.current);
    if (guestReconnectTimerRef.current) clearTimeout(guestReconnectTimerRef.current);
  }, []);

  const sendChat = useCallback((text: string, image?: string) => {
    if (!currentUser) return;
    const trimmedText = text.trim();
    if (!trimmedText && !image) return;

    const msg: ChatMessage = {
      id: Math.random().toString(36).substring(2, 9),
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
    setTimeout(() => setLastReaction(null), 3000);
  }, [currentUser, sendMessage]);

  const sendBuzz = useCallback(() => {
    if (!currentUser) return;
    sendMessage({ type: 'BUZZ', payload: { sender: currentUser.displayName } });
    const msg: ChatMessage = {
      id: Math.random().toString(36).substring(2, 9),
      sender: currentUser.displayName,
      text: '🔔 BUZZ!',
      timestamp: Date.now(),
    };
    setChatMessages((prev) => [...prev, msg]);
  }, [currentUser, sendMessage]);

  const leaveRoom = useCallback(() => {
    if (state.roomId) {
      roomDiscoveryManager.stopHostingRoom(state.roomId);
    }
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
    sendMessage,
    sendChat,
    sendReaction,
    sendBuzz,
    registerMessageListener,
  };
};
