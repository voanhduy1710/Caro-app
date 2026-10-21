import React from 'react';
import type { ActiveRoomInfo } from '../features/webrtc/roomDiscoveryService';
import { getAvatarPublicUrl } from '../features/avatar/avatarService';
import { ROOM_STATUS_TEXT, stagger } from './AppViewShared';
import { useT } from '../features/i18n/language';

interface Props {
  rooms: ActiveRoomInfo[];
  scanDone: boolean;
  onJoin: (roomId: string) => void;
}

export const PublicRoomList: React.FC<Props> = ({ rooms, scanDone, onJoin }) => {
  const t = useT();
  return (
  <div className="home-lobby__rooms card animate-pop-in text-left" style={stagger(6)}>
    <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
      <h2 className="text-lg text-ink">{t('home.publicRooms')}</h2>
      <span className="chip font-mono tabular-nums">{rooms.length}</span>
    </div>
    <div className="p-5">
      {rooms.length === 0 ? (
        <div className="rounded-md border border-dashed border-line bg-surface-2 p-6 text-center">
          <p className="text-sm font-medium text-ink">{scanDone ? t('home.noRooms') : t('home.scanning')}</p>
        </div>
      ) : (
        <div className="max-h-72 space-y-2.5 overflow-y-auto pr-1">
          {rooms.map((room) => {
            const full = room.members >= room.capacity;
            return (
              <div key={room.roomId} className="card-inset flex items-center justify-between gap-2 p-3 transition-colors hover:border-accent hover:bg-surface-3">
                <div className="flex min-w-0 items-center gap-3">
                  <img src={getAvatarPublicUrl(room.hostAvatar)} alt="" aria-hidden="true" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = getAvatarPublicUrl(); }} className="h-11 w-11 shrink-0 rounded-full border-2 border-accent bg-surface object-contain" />
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-semibold text-ink">{t('home.hostsRoom', { name: room.hostName })}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-muted">{t('home.code')} <span className="font-medium text-accent-text">{room.roomId}</span> · {room.boardSize}x{room.boardSize}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <span className="chip px-1.5 py-0 text-[11px]">{room.mode === 'casual' ? t('home.casual') : t('home.ranked')}</span>
                      <span className="chip px-1.5 py-0 text-[11px]">{t('home.players', { n: room.seatsFilled })}</span>
                      {room.viewers > 0 && <span className="chip px-1.5 py-0 text-[11px]">{t('home.watching', { n: room.viewers })}</span>}
                      <span className={`chip px-1.5 py-0 text-[11px] ${room.openSeat ? 'chip-accent' : ''}`}>{ROOM_STATUS_TEXT(room)}</span>
                    </div>
                  </div>
                </div>
                <button onClick={() => onJoin(room.roomId)} disabled={full} className={`btn btn-sm shrink-0 ${room.openSeat && !full ? 'btn-primary' : 'btn-secondary'}`}>{full ? t('home.full') : room.openSeat ? t('common.join') : t('home.watch')}</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  </div>
  );
};
