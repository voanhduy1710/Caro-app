import React from 'react';
import { Bot, Globe, Lock } from 'lucide-react';
import { stagger } from './AppViewShared';

export interface HomePlayActionsProps {
  isRoomPublic: boolean; setIsRoomPublic: React.Dispatch<React.SetStateAction<boolean>>; onStartBot: () => void; onCreate: (isPublic: boolean) => void;
  inputRoomCode: string; setInputRoomCode: React.Dispatch<React.SetStateAction<string>>; onJoin: (code: string) => void;
}

export const HomePlayActions: React.FC<HomePlayActionsProps> = ({ isRoomPublic, setIsRoomPublic, onStartBot, onCreate, inputRoomCode, setInputRoomCode, onJoin }) => (
  <div className="home-lobby__play grid gap-4 text-left md:grid-cols-5">
              {/* Play alone. Listed first because it is the only option that
                  works with nobody else around. */}
              <div className="card animate-pop-in flex flex-col gap-4 p-5 md:col-span-2" style={stagger(3)}>
                <h2 className="text-xl text-ink">Play the bot</h2>

                {/* The sprite is the opponent's portrait, and it is what keeps
                    this column from being a white void beside the taller form. */}
                <div className="grid flex-1 place-items-center rounded-md bg-accent-soft py-5">
                  <img
                    src="/Avatar/Rotar Zairo.gif"
                    alt=""
                    aria-hidden="true"
                    className="pixel-art h-32 w-32 object-contain"
                  />
                </div>

                <button
                  onClick={onStartBot}
                  className="btn btn-primary btn-lg w-full"
                >
                  <Bot size={20} strokeWidth={2.25} aria-hidden="true" />
                  <span>Play vs Bot</span>
                </button>
              </div>

              {/* Play someone else. */}
              <div className="card animate-pop-in space-y-4 p-5 md:col-span-3" style={stagger(4)}>
                <h2 className="text-xl text-ink">Play a friend</h2>

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
                      <span>Public</span>
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
                      <span>Private</span>
                    </button>
                  </div>
                  <p className="field-hint">
                    {isRoomPublic ? 'Anyone can find it, join a free seat or watch.' : 'Only with your code or link.'}
                  </p>
                </div>

                <button
                  onClick={() => onCreate(isRoomPublic)}
                  className="btn btn-primary btn-lg w-full"
                >
                  {`Create a ${isRoomPublic ? 'public' : 'private'} room`}
                </button>

                <div className="relative flex items-center py-1">
                  <div className="flex-grow border-t border-line"></div>
                  <span className="mx-3 flex-shrink text-xs text-subtle">or</span>
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
                    Join with a code
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
                      Join
                    </button>
                  </div>
                </form>
              </div>
            </div>
);
