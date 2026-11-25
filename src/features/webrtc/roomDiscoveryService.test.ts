import { describe, expect, it, vi } from 'vitest';
import { parseAnnouncedRoom } from './roomDiscoveryService';

// Hoisted above the import: the lobby must not open a realtime channel in a
// test, and it reads localStorage as soon as the module loads.
vi.mock('../../config/supabase', () => ({ supabase: null }));
vi.hoisted(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  });
});

const announced = (overrides: Record<string, unknown> = {}) => ({
  v: 2,
  roomId: 'ABCDEF',
  hostName: 'Host',
  boardSize: 19,
  mode: 'casual',
  createdAt: 1_000,
  lastHeartbeat: 2_000,
  seatsFilled: 2,
  viewers: 1,
  members: 3,
  capacity: 8,
  status: 'playing',
  openSeat: false,
  ...overrides,
});

describe('parseAnnouncedRoom', () => {
  it('accepts a 1v1 room', () => {
    expect(parseAnnouncedRoom(announced(), 5_000)?.seatsFilled).toBe(2);
  });

  it('accepts a full three-player room', () => {
    const room = parseAnnouncedRoom(announced({ seatsFilled: 3, viewers: 0, members: 3 }), 5_000);
    expect(room?.seatsFilled).toBe(3);
  });

  it('rejects a seat count no room can have', () => {
    expect(parseAnnouncedRoom(announced({ seatsFilled: 4, viewers: 0, members: 4 }), 5_000)).toBeNull();
  });

  it('rejects a board size the settings never offer', () => {
    expect(parseAnnouncedRoom(announced({ boardSize: 17 }), 5_000)).toBeNull();
  });

  it('rejects a capacity above the room limit', () => {
    expect(parseAnnouncedRoom(announced({ capacity: 9 }), 5_000)).toBeNull();
  });

  it('reads the seat total, defaulting to 2 for a host that does not send one', () => {
    expect(parseAnnouncedRoom(announced({ seats: 3, seatsFilled: 3, viewers: 0, members: 3 }), 5_000)?.seats).toBe(3);
    expect(parseAnnouncedRoom(announced(), 5_000)?.seats).toBe(2);
  });

  it('rejects a seat total no room has, or fewer seats than are filled', () => {
    expect(parseAnnouncedRoom(announced({ seats: 4 }), 5_000)).toBeNull();
    expect(parseAnnouncedRoom(announced({ seats: '3' }), 5_000)).toBeNull();
    expect(parseAnnouncedRoom(announced({ seats: 2, seatsFilled: 3, viewers: 0, members: 3 }), 5_000)).toBeNull();
  });
});
