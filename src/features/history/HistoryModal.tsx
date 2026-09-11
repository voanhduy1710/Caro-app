import React, { useEffect, useState } from 'react';
import { fetchUserMatchHistory } from './historyService';
import type { MatchRecord } from './types';
import { useAuth } from '../auth/AuthContext';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
      <div className="bg-white text-slate-800 w-full max-w-lg max-h-[85vh] rounded-2xl p-6 relative border border-slate-200 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">Match History Log</h2>
            <p className="text-[11px] text-slate-500 font-medium">Past match records and ELO rating adjustments</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-xl font-bold p-1"
          >
            ×
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search player or opponent name..."
            className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-600"
          />
        </div>

        {/* Match List Content */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {loading ? (
            <div className="py-12 text-center text-slate-500 text-xs font-mono">Loading match history...</div>
          ) : filteredHistory.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              No match history records found.
            </div>
          ) : (
            filteredHistory.map((m) => {
              const isP1 = user?.uid === m.player1Uid;
              const isWin = m.winnerUid === user?.uid;
              const isDraw = m.winnerUid === 'DRAW';
              const opponentName = isP1 ? m.player2Name : m.player1Name;
              const delta = isP1 ? m.eloDeltaPlayer1 : m.eloDeltaPlayer2;

              return (
                <div
                  key={m.id}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    {/* Result Badge */}
                    <div
                      className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase font-mono border ${
                        isDraw
                          ? 'bg-amber-50 text-amber-800 border-amber-300'
                          : isWin
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          : 'bg-rose-50 text-rose-800 border-rose-300'
                      }`}
                    >
                      {isDraw ? 'DRAW' : isWin ? 'WIN' : 'LOSS'}
                    </div>

                    <div>
                      <div className="text-xs font-bold text-slate-800">
                        vs <span className="text-emerald-700">{opponentName}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono flex items-center gap-2 mt-0.5">
                        <span>Grid {m.boardSize}×{m.boardSize}</span>
                        <span>•</span>
                        <span>{new Date(m.timestamp).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right font-mono">
                    <div
                      className={`text-xs font-bold ${
                        delta > 0 ? 'text-emerald-700' : delta < 0 ? 'text-rose-600' : 'text-slate-500'
                      }`}
                    >
                      {delta > 0 ? `+${delta}` : delta} ELO
                    </div>
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
