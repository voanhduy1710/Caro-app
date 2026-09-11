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

class RoomDiscoveryManager {
  private channel: BroadcastChannel | null = null;
  private supabaseChannel: any = null;
  private activeRoomsMap: Map<string, ActiveRoomInfo> = new Map();
  private listeners: Array<(rooms: ActiveRoomInfo[]) => void> = [];
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
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
          .on('broadcast', { event: 'ROOM_ANNOUNCE' }, ({ payload }: { payload: ActiveRoomInfo }) => {
            if (payload && payload.roomId) {
              this.activeRoomsMap.set(payload.roomId, payload);
              this.saveToLocalStorage();
              this.notifyListeners();
            }
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

    // Periodic 2s cleanup and sync
    setInterval(() => {
      this.syncFromLocalStorage();
    }, 2000);

    this.syncFromLocalStorage();
  }

  private syncFromLocalStorage() {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      const now = Date.now();
      const newMap = new Map<string, ActiveRoomInfo>();

      if (stored) {
        const parsed: ActiveRoomInfo[] = JSON.parse(stored);
        parsed.forEach((room) => {
          if (now - room.lastHeartbeat < 6000) {
            newMap.set(room.roomId, room);
          }
        });
      }

      // Keep current tab's hosted room alive
      if (this.currentHostedRoomId) {
        const existing = newMap.get(this.currentHostedRoomId) || {
          roomId: this.currentHostedRoomId,
          hostName: this.currentHostUser?.displayName || 'Host Player',
          hostAvatar: this.currentHostUser?.photoURL,
          boardSize: this.currentBoardSize,
          createdAt: Date.now(),
          lastHeartbeat: Date.now(),
        };
        existing.lastHeartbeat = Date.now();
        newMap.set(this.currentHostedRoomId, existing);
      }

      this.activeRoomsMap = newMap;
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

  private handleMessage(data: any) {
    if (!data || !data.type) return;

    if (data.type === 'ROOM_ANNOUNCE') {
      const room: ActiveRoomInfo = data.payload;
      this.activeRoomsMap.set(room.roomId, room);
      this.saveToLocalStorage();
      this.notifyListeners();
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
      hostName: this.currentHostUser?.displayName || 'Host Player',
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
    this.listeners.forEach((fn) => fn(activeList));
  }

  public subscribe(fn: (rooms: ActiveRoomInfo[]) => void) {
    this.listeners.push(fn);
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
    };
  }

  // Host starts broadcasting heartbeats for an open room
  public startHostingRoom(roomId: string, user: UserProfile | null, boardSize: number) {
    this.stopHostingRoom(roomId);

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
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.currentHostedRoomId === roomId) {
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
