import React, { useCallback, useState } from 'react';
import { Bot, Globe, Lock, MessageCircle, ScanLine } from 'lucide-react';
import type { RoomMode } from '../features/room/roomEngineTypes';
import { stagger } from './AppViewShared';
import { RankedRoomSwords } from './RankedRoomSwords';
import { useT } from '../features/i18n/language';
import { QrScanner } from '../features/pairing/QrScanner';
import { useIsDesktop } from '../shared/hooks/useMediaQuery';

export interface HomePlayActionsProps {
  isRoomPublic: boolean; setIsRoomPublic: React.Dispatch<React.SetStateAction<boolean>>; onStartBot: () => void; onCreate: (isPublic: boolean, mode?: RoomMode) => void;
  inputRoomCode: string; setInputRoomCode: React.Dispatch<React.SetStateAction<string>>; onJoin: (code: string) => void;
}

export const HomePlayActions: React.FC<HomePlayActionsProps> = ({ isRoomPublic, setIsRoomPublic, onStartBot, onCreate, inputRoomCode, setInputRoomCode, onJoin }) => {
  const t = useT();
  const isDesktop = useIsDesktop();
  const [scanning, setScanning] = useState(false);
  const closeScanner = useCallback(() => setScanning(false), []);
  return (
  <div className="home-lobby__play grid gap-4 text-left md:grid-cols-5">
              {/* A phone can take over a game running on a computer by scanning its pairing code. */}
              {!isDesktop && (
                <button type="button" onClick={() => setScanning(true)} className="btn btn-secondary btn-lg w-full animate-pop-in md:col-span-5" style={stagger(3)}>
                  <ScanLine size={20} strokeWidth={2.25} aria-hidden="true" />
                  <span>{t('pair.scan')}</span>
                </button>
              )}
              <QrScanner isOpen={scanning} onClose={closeScanner} />
              {/* Play alone. Listed first because it is the only option that
                  works with nobody else around. */}
              <div className="card animate-pop-in flex flex-col gap-4 p-5 md:col-span-2" style={stagger(3)}>
                <h2 className="text-xl text-ink">{t('home.playBot')}</h2>

                {/* The sprite is the opponent's portrait, and it is what keeps
                    this column from being a white void beside the taller form. */}
                <div className="grid flex-1 place-items-center rounded-md bg-accent-soft py-3">
                  <img
                    src="/Avatar/Rotar Zairo.gif"
                    alt=""
                    aria-hidden="true"
                    className="pixel-art h-20 w-20 object-contain"
                  />
                </div>

                <button
                  onClick={onStartBot}
                  className="btn btn-primary btn-lg w-full"
                >
                  <Bot size={20} strokeWidth={2.25} aria-hidden="true" />
                  <span>{t('home.playVsBot')}</span>
                </button>

                {/* A private room with no board: only the invite link and the chat. */}
                <button
                  onClick={() => onCreate(false, 'chat')}
                  className="btn btn-secondary btn-lg w-full"
                >
                  <MessageCircle size={20} strokeWidth={2.25} aria-hidden="true" />
                  <span>{t('home.justChatting')}</span>
                </button>
              </div>

              {/* Play someone else. */}
              <div className="card animate-pop-in space-y-4 p-5 md:col-span-3" style={stagger(4)}>
                <h2 className="text-xl text-ink">{t('home.playFriend')}</h2>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 rounded-md bg-surface-3 p-1">
                    <button
                      type="button"
                      onClick={() => setIsRoomPublic(true)}
                      aria-pressed={isRoomPublic}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-sm px-3 py-2 text-sm font-semibold transition ${
                        isRoomPublic ? 'bg-surface text-accent-text shadow-[0_3px_0_var(--ui-border-strong)]' : 'text-muted hover:text-ink'
                      }`}
                    >
                      <Globe size={14} strokeWidth={2.25} aria-hidden="true" />
                      <span>{t('home.public')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsRoomPublic(false)}
                      aria-pressed={!isRoomPublic}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-sm px-3 py-2 text-sm font-semibold transition ${
                        !isRoomPublic ? 'bg-surface text-accent-text shadow-[0_3px_0_var(--ui-border-strong)]' : 'text-muted hover:text-ink'
                      }`}
                    >
                      <Lock size={14} strokeWidth={2.25} aria-hidden="true" />
                      <span>{t('home.private')}</span>
                    </button>
                  </div>
                  <p className="field-hint">
                    {isRoomPublic ? t('home.publicHint') : t('home.privateHint')}
                  </p>
                </div>

                {isRoomPublic ? (
                  <div className="grid gap-2">
                    <button onClick={() => onCreate(true, 'casual')} className="btn btn-secondary btn-lg w-full">{t('home.createCasual')}</button>
                    <button onClick={() => onCreate(true, 'ranked')} className="btn btn-ranked btn-lg w-full">
                      <RankedRoomSwords side="left" />
                      <span>{t('home.createRanked')}</span>
                      <RankedRoomSwords side="right" />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => onCreate(false, 'ranked')} className="btn btn-primary btn-lg w-full">{t('home.createPrivate')}</button>
                )}
                {isRoomPublic && <p className="field-hint">{t('home.rankedHint')}</p>}

                <div className="relative flex items-center py-1">
                  <div className="flex-grow border-t border-line"></div>
                  <span className="mx-3 flex-shrink text-xs text-subtle">{t('home.or')}</span>
                  <div className="flex-grow border-t border-line"></div>
                </div>

                {/* A form, so Enter and the button behave identically. */}
                <form
                  className="field"
                  onSubmit={(e) => {
                    e.preventDefault();
                    onJoin(inputRoomCode);
                  }}
                >
                  <label htmlFor="room-code" className="field-label">
                    {t('home.joinWithCode')}
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="room-code"
                      type="text"
                      value={inputRoomCode}
                      onChange={(e) => setInputRoomCode(e.target.value)}
                      placeholder="ABC123"
                      autoComplete="off"
                      spellCheck={false}
                      className={`field-input flex-1 ${
                        inputRoomCode.includes('/')
                          ? 'text-xs'
                          : 'text-center font-mono uppercase tracking-[0.2em]'
                      }`}
                    />
                    <button
                      type="submit"
                      disabled={!inputRoomCode.trim()}
                      className="btn btn-primary shrink-0"
                    >
                      {t('common.join')}
                    </button>
                  </div>
                </form>
              </div>
            </div>
  );
};
