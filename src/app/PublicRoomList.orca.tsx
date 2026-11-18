import React from 'react';
import { Radio } from 'lucide-react';
import { getAvatarPublicUrl } from '../features/avatar/avatarService';
import { ROOM_STATUS_TEXT } from './AppViewShared';
import { useT } from '../features/i18n/language';
import { Badge, Button } from '../shared/ui/primitives';

import type { PublicRoomListProps } from './PublicRoomList';

/** Orca public room list (PR 5 PublicRoomList), with today's seat counts. */
export const PublicRoomListOrca: React.FC<PublicRoomListProps> = ({ rooms, scanDone, onJoin }) => {
  const t = useT();

  return (
    <div className="rounded-lg border border-line bg-surface flex flex-col text-left">
      {/* Header bar */}
      <div className="px-4 py-3 border-b border-line flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">{t('home.publicRooms')}</h2>
        <Badge tone="neutral" className="font-mono tabular-nums text-xs">
          {rooms.length}
        </Badge>
      </div>

      {/* Empty / scanning / list states */}
      <div className="flex-1 min-h-0">
        {rooms.length === 0 ? (
          !scanDone ? (
            <div className="p-4 space-y-3">
              {[0, 1].map((i) => (
                <div key={i} className="flex items-center justify-between gap-3 animate-pulse">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-full bg-surface-2" />
                    <div className="space-y-1.5">
                      <div className="h-3.5 w-24 rounded bg-surface-2" />
                      <div className="h-3 w-36 rounded bg-surface-2" />
                    </div>
                  </div>
                  <div className="h-7 w-14 rounded bg-surface-2" />
                </div>
              ))}
              <p className="text-center text-xs text-muted pt-1">{t('home.scanning')}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-subtle mb-2">
                <Radio size={16} strokeWidth={1.75} aria-hidden="true" />
              </div>
              <p className="text-xs font-medium text-ink">{t('home.noRooms')}</p>
            </div>
          )
        ) : (
          <div className="max-h-80 overflow-y-auto divide-y divide-line">
            {rooms.map((room) => {
              const full = room.members >= room.capacity;
              const viewerCount = room.viewers;
              // Seats the room plays with (3 in a three-player room), not its member cap.
              const capacity = room.seats;
              const seated = room.seatsFilled;

              return (
                <div
                  key={room.roomId}
                  className="flex items-center justify-between gap-3 p-3.5 transition-colors hover:bg-surface-2"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <img
                      src={getAvatarPublicUrl(room.hostAvatar)}
                      alt=""
                      aria-hidden="true"
                      onError={(event) => {
                        event.currentTarget.onerror = null;
                        event.currentTarget.src = getAvatarPublicUrl();
                      }}
                      className="h-9 w-9 shrink-0 rounded-full border border-line bg-surface-2 object-contain"
                    />
                    <div className="min-w-0 space-y-1">
                      <div className="truncate text-xs font-semibold text-ink">
                        {t('home.hostsRoom', { name: room.hostName })}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                        <span className="font-mono font-medium text-accent-text tabular-nums">
                          {room.roomId}
                        </span>
                        <span>·</span>
                        <span className="font-mono tabular-nums">{room.boardSize}×{room.boardSize}</span>
                        <span>·</span>
                        <span className="font-mono tabular-nums">{seated}/{capacity}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        <Badge tone={room.mode === 'ranked' ? 'warning' : 'neutral'} className="text-[11px]">
                          {room.mode === 'ranked' ? t('home.ranked') : t('home.casual')}
                        </Badge>
                        <Badge tone={room.openSeat ? 'accent' : 'neutral'} className="text-[11px]">
                          {ROOM_STATUS_TEXT(room)}
                        </Badge>
                        {viewerCount > 0 && (
                          <Badge tone="neutral" className="font-mono text-[11px] tabular-nums">
                            {t('home.watching', { n: viewerCount })}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <Button
                    variant={room.openSeat && !full ? 'primary' : 'secondary'}
                    size="sm"
                    disabled={full}
                    onClick={() => onJoin(room.roomId)}
                    className="shrink-0"
                  >
                    {full ? t('home.full') : room.openSeat ? t('common.join') : t('home.watch')}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
