import { useEffect, useState } from 'react';
import type { UserProfile } from '../auth/AuthContext';
import { supabase } from '../../config/supabase';

export interface ActiveRoomInfo {
  roomId: string;
  hostName: string;
  hostAvatar?: string;
  boardSize: number;
  createdAt: number;
  lastHeartbeat: number;
}

const BROADCAST_CHANNEL_NAME = 'caro_active_rooms_channel';
const LOCAL_STORAGE_KEY = 'caro_active_rooms_registry';
const REALTIME_ROOM_CHANNEL = 'caro_public_lobby';

// Anyone can announce a room on the public lobby, and whatever is kept is
// rendered on the home page and saved to localStorage across reloads. So an
// announced room is only accepted in the shape this app itself sends.
//
// Mirrors ROOM_CODE_PATTERN in useWebRTC, so a listed room is always one that
// Join accepts. It cannot be imported from there: useWebRTC imports this
// module, and the manager below reads storage while this module is still
// loading, before a circular import would have finished.
const ROOM_CODE_PATTERN = /^[A-Z0-9]{4,12}$/;
// The sizes the settings dialog offers.
const BOARD_SIZES = [15, 19, 30, 50];
// The longest display name signup accepts.
const MAX_HOST_NAME_LENGTH = 40;
const DEFAULT_HOST_NAME = 'Host Player';

/**
 * Turns an announced room into one the lobby can safely show and save, or null
 * when it is not a room this app could have sent.
 *
 * One broadcast with an object for a name used to throw while the lobby
 * rendered, and because that room had been saved, the home page stayed blank
 * on every reload after.
 */
const parseAnnouncedRoom = (value: unknown, now: number): ActiveRoomInfo | null => {
  if (typeof value !== 'object' || value === null) return null;
  const { roomId, hostName, hostAvatar, boardSize, createdAt, lastHeartbeat } = value as Record<string, unknown>;

  if (typeof roomId !== 'string' || !ROOM_CODE_PATTERN.test(roomId)) return null;
  if (typeof hostName !== 'string') return null;
  if (typeof boardSize !== 'number' || !BOARD_SIZES.includes(boardSize)) return null;
  if (hostAvatar !== undefined && typeof hostAvatar !== 'string') return null;
  if (typeof lastHeartbeat !== 'number' || !Number.isFinite(lastHeartbeat)) return null;

  return {
    roomId,
    hostName: hostName.trim().slice(0, MAX_HOST_NAME_LENGTH) || DEFAULT_HOST_NAME,
    hostAvatar,
    boardSize,
    // Another device's clock is not ours. A heartbeat stamped in the future
    // kept its room listed until that moment came round, so neither time may
    // be later than now. createdAt only orders the list, so a missing one just
    // sorts the room as new.
    createdAt: typeof createdAt === 'number' && Number.isFinite(createdAt) ? Math.min(createdAt, now) : now,
    lastHeartbeat: Math.min(lastHeartbeat, now),
  };
};

class RoomDiscoveryManager {
  private channel: BroadcastChannel | null = null;
  private supabaseChannel: any = null;
  private activeRoomsMap: Map<string, ActiveRoomInfo> = new Map();
  private listeners: Array<(rooms: ActiveRoomInfo[]) => void> = [];
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private currentList: ActiveRoomInfo[] = [];
  private listSignature = '';
  private currentHostedRoomId: string | null = null;
  private currentHostUser: UserProfile | null = null;
  private currentBoardSize: number = 50;

  constructor() {
    // 1. Local BroadcastChannel
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        this.channel.onmessage = (event) => {
          this.handleMessage(event.data);
        };
      } catch (e) {
        console.warn('BroadcastChannel error:', e);
      }
    }

    // 2. Storage event listener
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (event) => {
        if (event.key === LOCAL_STORAGE_KEY) {
          this.syncFromLocalStorage();
        }
      });
    }

    // 3. Supabase Realtime WebSocket Broadcast (Zero-DB for Incognito / Cross-Browser)
    if (supabase) {
      try {
        this.supabaseChannel = supabase.channel(REALTIME_ROOM_CHANNEL, {
          config: { broadcast: { self: false } },
        });

        this.supabaseChannel
          .on('broadcast', { event: 'ROOM_ANNOUNCE' }, ({ payload }: { payload: unknown }) => {
            this.acceptAnnouncement(payload);
          })
          .on('broadcast', { event: 'ROOM_CLOSED' }, ({ payload }: { payload: { roomId: string } }) => {
            if (payload && payload.roomId) {
              this.activeRoomsMap.delete(payload.roomId);
              this.saveToLocalStorage();
              this.notifyListeners();
            }
          })
          .on('broadcast', { event: 'ROOM_QUERY' }, () => {
            if (this.currentHostedRoomId) {
              this.sendRoomAnnounce();
            }
          })
          .subscribe((status: string) => {
            if (status === 'SUBSCRIBED') {
              // Query existing active hosts on join
              try {
                this.supabaseChannel?.send({
                  type: 'broadcast',
                  event: 'ROOM_QUERY',
                  payload: {},
                });
              } catch (e) {}
            }
          });
      } catch (e) {
        console.warn('Failed to setup Supabase Realtime room channel:', e);
      }
    }

    this.syncFromLocalStorage();
  }

  // The poll only runs while something is actually listening. It used to run
  // for the lifetime of the tab and re-render the whole app every 2 seconds,
  // including in the middle of a match.
  private startPolling() {
    if (this.pollInterval) return;
    this.pollInterval = setInterval(() => {
      this.syncFromLocalStorage();
    }, 2000);
  }

  private stopPolling() {
    if (!this.pollInterval) return;
    clearInterval(this.pollInterval);
    this.pollInterval = null;
  }

  private syncFromLocalStorage() {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      const now = Date.now();
      const newMap = new Map<string, ActiveRoomInfo>();
      let repaired = false;

      if (stored) {
        // Storage outlives the build that wrote it, and older builds saved
        // announcements unchecked, so it gets the same checks as the network.
        const parsed: unknown = JSON.parse(stored);
        const entries = Array.isArray(parsed) ? parsed : [];
        repaired = !Array.isArray(parsed);
        entries.forEach((entry) => {
          const room = parseAnnouncedRoom(entry, now);
          if (!room || room.lastHeartbeat !== entry.lastHeartbeat) repaired = true;
          if (room && now - room.lastHeartbeat < 6000) {
            newMap.set(room.roomId, room);
          }
        });
      }

      // Keep current tab's hosted room alive
      if (this.currentHostedRoomId) {
        const existing = newMap.get(this.currentHostedRoomId) || {
          roomId: this.currentHostedRoomId,
          hostName: this.currentHostUser?.displayName || DEFAULT_HOST_NAME,
          hostAvatar: this.currentHostUser?.photoURL,
          boardSize: this.currentBoardSize,
          createdAt: Date.now(),
          lastHeartbeat: Date.now(),
        };
        existing.lastHeartbeat = Date.now();
        newMap.set(this.currentHostedRoomId, existing);
      }

      this.activeRoomsMap = newMap;
      // Write back anything rejected or clamped. A heartbeat clamped only in
      // memory would come back from the future on the next poll and keep its
      // room listed forever.
      if (repaired) this.saveToLocalStorage();
      this.notifyListeners();
    } catch (e) {
      console.warn('Failed to sync active rooms:', e);
    }
  }

  private saveToLocalStorage() {
    try {
      const activeList = Array.from(this.activeRoomsMap.values());
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(activeList));
    } catch (e) {
      console.warn('Failed to save active rooms:', e);
    }
  }

  // Every ROOM_ANNOUNCE comes through here, whichever channel carried it.
  private acceptAnnouncement(payload: unknown) {
    const now = Date.now();
    const room = parseAnnouncedRoom(payload, now);
    if (!room) return;

    // An announcement proves the host was alive when it reached us, so it is
    // timed on our clock. The sender's clock kept a host that runs fast listed
    // long after it had gone, and made one that runs slow flicker in and out
    // of the list as stale.
    room.lastHeartbeat = now;
    this.activeRoomsMap.set(room.roomId, room);
    this.saveToLocalStorage();
    this.notifyListeners();
  }

  private handleMessage(data: any) {
    if (!data || !data.type) return;

    if (data.type === 'ROOM_ANNOUNCE') {
      this.acceptAnnouncement(data.payload);
    } else if (data.type === 'ROOM_CLOSED') {
      const { roomId } = data.payload;
      this.activeRoomsMap.delete(roomId);
      this.saveToLocalStorage();
      this.notifyListeners();
    }
  }

  private sendRoomAnnounce() {
    if (!this.currentHostedRoomId) return;

    const roomInfo: ActiveRoomInfo = {
      roomId: this.currentHostedRoomId,
      hostName: this.currentHostUser?.displayName || DEFAULT_HOST_NAME,
      hostAvatar: this.currentHostUser?.photoURL,
      boardSize: this.currentBoardSize,
      createdAt: Date.now(),
      lastHeartbeat: Date.now(),
    };

    this.activeRoomsMap.set(this.currentHostedRoomId, roomInfo);
    this.saveToLocalStorage();
    this.notifyListeners();

    // 1. Send via local BroadcastChannel
    if (this.channel) {
      try {
        this.channel.postMessage({ type: 'ROOM_ANNOUNCE', payload: roomInfo });
      } catch (e) {}
    }

    // 2. Send via Supabase Realtime WebSocket Broadcast (Zero-DB)
    if (this.supabaseChannel) {
      try {
        this.supabaseChannel.send({
          type: 'broadcast',
          event: 'ROOM_ANNOUNCE',
          payload: roomInfo,
        });
      } catch (e) {}
    }
  }

  private notifyListeners() {
    const activeList = Array.from(this.activeRoomsMap.values()).sort(
      (a, b) => b.createdAt - a.createdAt
    );

    // Heartbeats rewrite lastHeartbeat every couple of seconds without the
    // lobby actually changing. Compare only what the UI shows, so subscribers
    // re-render when a room really appears, disappears or is renamed.
    const signature = activeList
      .map((room) => `${room.roomId}|${room.hostName}|${room.hostAvatar || ''}|${room.boardSize}`)
      .join('~');

    this.currentList = activeList;
    if (signature === this.listSignature) return;
    this.listSignature = signature;

    this.listeners.forEach((fn) => fn(activeList));
  }

  public subscribe(fn: (rooms: ActiveRoomInfo[]) => void) {
    this.listeners.push(fn);
    this.startPolling();
    // Hand the newcomer the current list directly; notifyListeners is allowed
    // to stay silent when nothing changed.
    fn(this.currentList);
    this.syncFromLocalStorage();
    if (this.supabaseChannel) {
      try {
        this.supabaseChannel.send({
          type: 'broadcast',
          event: 'ROOM_QUERY',
          payload: {},
        });
      } catch (e) {}
    }
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
      if (this.listeners.length === 0) this.stopPolling();
    };
  }

  // Host starts broadcasting heartbeats for an open room
  public startHostingRoom(roomId: string, user: UserProfile | null, boardSize: number) {
    if (this.currentHostedRoomId) this.stopHostingRoom(this.currentHostedRoomId);

    this.currentHostedRoomId = roomId;
    this.currentHostUser = user;
    this.currentBoardSize = boardSize;

    this.sendRoomAnnounce();
    this.heartbeatInterval = setInterval(() => {
      this.sendRoomAnnounce();
    }, 2000);
  }

  // Host stops room (game started or room left)
  public stopHostingRoom(roomId: string) {
    // Only the room that owns the heartbeat may stop it, otherwise closing an
    // unrelated room silently killed the live room's announcements.
    if (this.currentHostedRoomId === roomId) {
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }
      this.currentHostedRoomId = null;
      this.currentHostUser = null;
    }

    if (roomId) {
      this.activeRoomsMap.delete(roomId);
      this.saveToLocalStorage();
      this.notifyListeners();

      if (this.channel) {
        try {
          this.channel.postMessage({ type: 'ROOM_CLOSED', payload: { roomId } });
        } catch (e) {}
      }

      if (this.supabaseChannel) {
        try {
          this.supabaseChannel.send({
            type: 'broadcast',
            event: 'ROOM_CLOSED',
            payload: { roomId },
          });
        } catch (e) {}
      }
    }
  }
}

export const roomDiscoveryManager = new RoomDiscoveryManager();

/**
 * Forgets every room this browser has cached. The error screen offers it for
 * when a bad saved room would crash the page again on every load.
 */
export const clearSavedRooms = () => {
  try {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to clear saved rooms:', e);
  }
};

export const useAvailableRooms = () => {
  const [rooms, setRooms] = useState<ActiveRoomInfo[]>([]);

  useEffect(() => {
    const unsubscribe = roomDiscoveryManager.subscribe((activeRooms) => {
      setRooms(activeRooms);
    });
    return () => unsubscribe();
  }, []);

  return rooms;
};
