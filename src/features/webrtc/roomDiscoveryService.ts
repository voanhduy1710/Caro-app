import { useEffect, useState } from 'react';
import { supabase } from '../../config/supabase';
import { ROOM_CODE_PATTERN } from './roomCode';
import { sanitizeAvatar } from '../room/protocol';

export type AnnouncedStatus = 'waiting' | 'playing' | 'paused' | 'ended';

/** A public room as the lobby lists it. Only rooms from this version of the app are kept. */
export interface ActiveRoomInfo {
  v: 2;
  roomId: string;
  hostName: string;
  hostAvatar?: string;
  boardSize: number;
  createdAt: number;
  lastHeartbeat: number;
  seatsFilled: 0 | 1 | 2;
  viewers: number;
  members: number;
  capacity: number;
  status: AnnouncedStatus;
  /** A seat is empty and a newcomer could take it: the row says Join rather than Watch. */
  openSeat: boolean;
}

/** What the hosting tab says about its room; the rest is stamped on the way out. */
export type HostedRoomInfo = Omit<ActiveRoomInfo, 'v' | 'roomId' | 'lastHeartbeat'>;

const BROADCAST_CHANNEL_NAME = 'caro_active_rooms_channel';
const LOCAL_STORAGE_KEY = 'caro_active_rooms_registry';
const REALTIME_ROOM_CHANNEL = 'caro_public_lobby';
/** A room not heard from for this long has gone. */
const STALE_AFTER_MS = 6000;
const HEARTBEAT_MS = 2000;

// Anyone can announce a room on the public lobby, and whatever is kept is
// rendered on the home page and saved to localStorage across reloads. So an
// announced room is only accepted in the shape this app itself sends.
// The sizes the settings dialog offers.
const BOARD_SIZES = [15, 19, 30, 50];
const STATUSES: readonly string[] = ['waiting', 'playing', 'paused', 'ended'];
// The longest display name signup accepts.
const MAX_HOST_NAME_LENGTH = 40;
const DEFAULT_HOST_NAME = 'Host Player';
/** The room size the app enforces. A larger claim is not a room this app sent. */
const MAX_CAPACITY = 8;

/**
 * The one rule for a host's name, applied to rooms read from the network and to
 * the room this tab announces itself, so the two never disagree. It cuts by code
 * point rather than by UTF-16 unit, so a long name is never cut through the
 * middle of an emoji and left ending in a broken glyph.
 */
const normaliseHostName = (name: string) =>
  Array.from(name.trim()).slice(0, MAX_HOST_NAME_LENGTH).join('') || DEFAULT_HOST_NAME;

const isCount = (value: unknown, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max;

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
  const {
    v,
    roomId,
    hostName,
    hostAvatar,
    boardSize,
    createdAt,
    lastHeartbeat,
    seatsFilled,
    viewers,
    members,
    capacity,
    status,
    openSeat,
  } = value as Record<string, unknown>;

  // Rooms from the previous version seat two people and nobody else; joining
  // one from here would only be turned away, so they are not listed.
  if (v !== 2) return null;
  if (typeof roomId !== 'string' || !ROOM_CODE_PATTERN.test(roomId)) return null;
  if (typeof hostName !== 'string') return null;
  if (typeof boardSize !== 'number' || !BOARD_SIZES.includes(boardSize)) return null;
  if (hostAvatar !== undefined && typeof hostAvatar !== 'string') return null;
  if (typeof lastHeartbeat !== 'number' || !Number.isFinite(lastHeartbeat)) return null;
  if (!isCount(capacity, MAX_CAPACITY) || capacity < 2) return null;
  if (!isCount(members, capacity) || members < 1) return null;
  if (seatsFilled !== 0 && seatsFilled !== 1 && seatsFilled !== 2) return null;
  if (!isCount(viewers, capacity) || seatsFilled + viewers !== members) return null;
  if (typeof status !== 'string' || !STATUSES.includes(status)) return null;
  if (typeof openSeat !== 'boolean') return null;

  return {
    v: 2,
    roomId,
    hostName: normaliseHostName(hostName),
    // Every lobby would fetch an arbitrary image URL and hand its server the
    // viewer's address, so only our own avatars and Google photos survive.
    hostAvatar: sanitizeAvatar(hostAvatar) ?? undefined,
    boardSize,
    // Another device's clock is not ours. A heartbeat stamped in the future
    // kept its room listed until that moment came round, so neither time may
    // be later than now. createdAt only orders the list, so a missing one just
    // sorts the room as new.
    createdAt: typeof createdAt === 'number' && Number.isFinite(createdAt) ? Math.min(createdAt, now) : now,
    lastHeartbeat: Math.min(lastHeartbeat, now),
    seatsFilled,
    viewers,
    members,
    capacity,
    status: status as AnnouncedStatus,
    openSeat,
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
  private currentHostedInfo: HostedRoomInfo | null = null;
  /** What the last announcement said, so an unchanged room is not re-sent early. */
  private announcedSignature = '';

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

  /** This tab's own room, stamped as alive now. */
  private hostedEntry(now: number): ActiveRoomInfo | null {
    if (!this.currentHostedRoomId || !this.currentHostedInfo) return null;
    const info = this.currentHostedInfo;
    return {
      ...info,
      v: 2,
      roomId: this.currentHostedRoomId,
      hostName: normaliseHostName(info.hostName),
      hostAvatar: sanitizeAvatar(info.hostAvatar) ?? undefined,
      lastHeartbeat: now,
    };
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
          if (room && now - room.lastHeartbeat < STALE_AFTER_MS) {
            newMap.set(room.roomId, room);
          }
        });
      }

      // Keep current tab's hosted room alive
      const own = this.hostedEntry(now);
      if (own) newMap.set(own.roomId, own);

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
    const roomInfo = this.hostedEntry(Date.now());
    if (!roomInfo) return;

    this.activeRoomsMap.set(roomInfo.roomId, roomInfo);
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
    // A room someone can sit down in is what most visitors are looking for, so
    // those come first; within each group the newest room leads.
    const activeList = Array.from(this.activeRoomsMap.values()).sort(
      (a, b) => Number(b.openSeat) - Number(a.openSeat) || b.createdAt - a.createdAt
    );

    // Heartbeats rewrite lastHeartbeat every couple of seconds without the
    // lobby actually changing. Compare only what the UI shows, so subscribers
    // re-render when a room really appears, disappears or changes.
    const signature = activeList
      .map(
        (room) =>
          `${room.roomId}|${room.hostName}|${room.hostAvatar || ''}|${room.boardSize}|${room.seatsFilled}|${room.viewers}|${room.status}|${room.openSeat}`
      )
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

  /**
   * Announces this tab's room, or updates what is announced about it. The
   * heartbeat keeps going for as long as the room is listed, games included,
   * so people can come and watch; a change is sent at once rather than on the
   * next beat.
   */
  public hostRoom(roomId: string, info: HostedRoomInfo) {
    if (this.currentHostedRoomId && this.currentHostedRoomId !== roomId) {
      this.stopHostingRoom(this.currentHostedRoomId);
    }
    this.currentHostedInfo = info;
    const signature = JSON.stringify(info);
    if (this.currentHostedRoomId === roomId && this.heartbeatInterval) {
      if (signature !== this.announcedSignature) {
        this.announcedSignature = signature;
        this.sendRoomAnnounce();
      }
      return;
    }
    this.currentHostedRoomId = roomId;
    this.announcedSignature = signature;
    this.sendRoomAnnounce();
    this.heartbeatInterval = setInterval(() => {
      this.sendRoomAnnounce();
    }, HEARTBEAT_MS);
  }

  /** Takes the room off the list. Only the hosting tab ever calls this. */
  public stopHostingRoom(roomId: string) {
    // Only the room that owns the heartbeat may stop it, otherwise closing an
    // unrelated room silently killed the live room's announcements.
    if (this.currentHostedRoomId === roomId) {
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }
      this.currentHostedRoomId = null;
      this.currentHostedInfo = null;
      this.announcedSignature = '';
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
