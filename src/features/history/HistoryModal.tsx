import React, { useEffect, useState } from 'react';
import { ListSkeleton } from '../../shared/components/ListSkeleton';
import { X } from 'lucide-react';
import { fetchUserMatchHistory } from './historyService';
import type { MatchRecord } from './types';
import { useAuth } from '../auth/AuthContext';
import { useModalChrome } from '../../shared/hooks/useModalChrome';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Closes the dialog and drops the player straight into a practice game. */
  onPlayNow: () => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({ isOpen, onClose, onPlayNow }) => {
  const { user } = useAuth();
  const dialogProps = useModalChrome(isOpen, onClose, 'history-modal-title');
  const [history, setHistory] = useState<MatchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const loadHistory = async () => {
    if (!user) return;
    setLoading(true);
    const data = await fetchUserMatchHistory(user.uid);
    setHistory(data);
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen && user) {
      loadHistory();
    }
  }, [isOpen, user]);

  if (!isOpen) return null;

  const filteredHistory = history.filter((m) =>
    m.player1Name.toLowerCase().includes(search.toLowerCase()) ||
    m.player2Name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div {...dialogProps} className="modal-scrim">
      <div className="modal-panel max-w-lg max-h-[85vh] relative p-6 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 border-b border-line pb-3">
          <div>
            <h2 id="history-modal-title" className="text-lg font-semibold text-ink tracking-tight">Match History Log</h2>
            <p className="text-[11px] text-muted font-medium">
              Online matches and practice games played on this device
            </p>
          </div>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-icon"
           aria-label="Close">
            <X size={18} strokeWidth={2.25} aria-hidden="true" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search player or opponent name..."
            className="w-full bg-surface-2 border border-line-strong rounded-sm px-3 py-2 text-xs text-ink placeholder-subtle focus:outline-none focus:border-accent"
          />
        </div>

        {/* Match List Content. "Nothing yet" and "nothing matched your search"
            are different problems, so they get different ways out. */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {loading ? (
            <ListSkeleton rows={4} />
          ) : history.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <p className="text-xs text-muted">You have not finished a match yet.</p>
              <button type="button" onClick={onPlayNow} className="btn btn-primary btn-sm">
                Play the bot now
              </button>
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <p className="text-xs text-muted">
                No match involves a player called &ldquo;{search}&rdquo;.
              </p>
              <button type="button" onClick={() => setSearch('')} className="btn btn-secondary btn-sm">
                Clear search
              </button>
            </div>
          ) : (
            filteredHistory.map((m) => {
              const isP1 = user?.uid === m.player1Uid;
              const isWin = m.winnerUid === user?.uid;
              const isDraw = m.winnerUid === 'DRAW';
              const opponentName = isP1 ? m.player2Name : m.player1Name;
              const delta = isP1 ? m.eloDeltaPlayer1 : m.eloDeltaPlayer2;
              const isPractice = m.mode === 'ai';

              return (
                <div
                  key={m.id}
                  className="p-3 rounded-md bg-surface-2 border border-line flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    {/* Result Badge */}
                    <div
                      className={`px-2 py-0.5 rounded-sm text-[10px] font-semibold uppercase font-mono border ${
                        isDraw
                          ? 'bg-warning-soft text-warning border-warning'
                          : isWin
                          ? 'bg-accent-soft text-accent-text border-accent'
                          : 'bg-danger-soft text-danger border-danger'
                      }`}
                    >
                      {isDraw ? 'DRAW' : isWin ? 'WIN' : 'LOSS'}
                    </div>

                    <div>
                      <div className="text-xs font-medium text-ink">
                        vs <span className="text-accent-text">{opponentName}</span>
                      </div>
                      <div className="text-[10px] text-muted font-mono flex items-center gap-2 mt-0.5">
                        <span>Grid {m.boardSize}×{m.boardSize}</span>
                        <span>•</span>
                        <span>{new Date(m.timestamp).toLocaleDateString()}</span>
                        {isPractice && (
                          <>
                            <span>•</span>
                            <span>Practice</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-right font-mono">
                    {/* Practice never touches the rating, so claiming "0 ELO"
                        would read as a result rather than as not applicable. */}
                    {isPractice ? (
                      <div className="text-xs font-medium text-subtle">No rating</div>
                    ) : (
                      <div
                        className={`text-xs font-medium ${
                          delta > 0 ? 'text-accent-text' : delta < 0 ? 'text-danger' : 'text-muted'
                        }`}
                      >
                        {delta > 0 ? `+${delta}` : delta} ELO
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
