import React, { useCallback, useId, useState } from 'react';
import { Bot, Globe, Lock, MessageSquare, ScanLine, Trophy, Users } from 'lucide-react';
import { useT } from '../features/i18n/language';
import { QrScanner } from '../features/pairing/QrScanner';
import { useIsDesktop } from '../shared/hooks/useMediaQuery';
import { Button, SegmentedControl, type SegmentedOption } from '../shared/ui/primitives';
import { cn } from '../shared/ui/cn';

import type { HomePlayActionsProps } from './HomePlayActions';

type VisibilityMode = 'public' | 'private';

/** Orca lobby play card (PR 5 HomePlayActions), on today's props and room modes. */
export const HomePlayActionsOrca: React.FC<HomePlayActionsProps> = ({
  isRoomPublic,
  setIsRoomPublic,
  onStartBot,
  onCreate,
  inputRoomCode,
  setInputRoomCode,
  onJoin,
}) => {
  const t = useT();
  const isDesktop = useIsDesktop();
  const [scanning, setScanning] = useState(false);
  const roomCodeInputId = useId();

  const closeScanner = useCallback(() => setScanning(false), []);

  const visibilityOptions: ReadonlyArray<SegmentedOption<VisibilityMode>> = [
    {
      value: 'public',
      label: (
        <span className="flex items-center gap-1.5">
          <Globe size={13} strokeWidth={1.75} aria-hidden="true" />
          <span>{t('home.public')}</span>
        </span>
      ),
    },
    {
      value: 'private',
      label: (
        <span className="flex items-center gap-1.5">
          <Lock size={13} strokeWidth={1.75} aria-hidden="true" />
          <span>{t('home.private')}</span>
        </span>
      ),
    },
  ];

  const trimmedCode = inputRoomCode.trim();

  return (
    <div className="rounded-lg border border-line bg-surface p-4 space-y-4 text-left">
      {/* Primary Action Row: Play vs Bot, Just Chatting, Mobile Scan QR */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Button
          variant="primary"
          size="md"
          onClick={onStartBot}
          className="w-full justify-center gap-2 h-9"
        >
          <Bot size={15} strokeWidth={1.75} aria-hidden="true" />
          <span>{t('home.playVsBot')}</span>
        </Button>
        <Button
          variant="secondary"
          size="md"
          onClick={() => onCreate(false, 'chat')}
          className="w-full justify-center gap-2 h-9"
        >
          <MessageSquare size={15} strokeWidth={1.75} aria-hidden="true" />
          <span>{t('home.justChatting')}</span>
        </Button>
        {!isDesktop && (
          <Button
            variant="secondary"
            size="md"
            onClick={() => setScanning(true)}
            className="col-span-1 sm:col-span-2 w-full justify-center gap-2 h-9"
          >
            <ScanLine size={15} strokeWidth={1.75} aria-hidden="true" />
            <span>{t('pair.scan')}</span>
          </Button>
        )}
      </div>

      <div className="border-t border-line" />

      {/* Play a Friend / Online Room */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">{t('home.playFriend')}</h2>
        </div>

        <SegmentedControl<VisibilityMode>
          value={isRoomPublic ? 'public' : 'private'}
          options={visibilityOptions}
          onChange={(val) => setIsRoomPublic(val === 'public')}
          ariaLabel={t('home.playFriend')}
          className="w-full grid grid-cols-2"
        />

        <p className="text-[11.5px] text-muted leading-relaxed">
          {isRoomPublic ? t('home.publicHint') : t('home.privateHint')}
        </p>

        {isRoomPublic ? (
          <div className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button
                variant="primary"
                size="md"
                onClick={() => onCreate(true, 'ranked')}
                className="w-full justify-center gap-2 h-9"
              >
                <Trophy size={15} strokeWidth={1.75} aria-hidden="true" />
                <span>{t('home.orcaCreateRanked')}</span>
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={() => onCreate(true, 'casual')}
                className="w-full justify-center gap-2 h-9"
              >
                <Users size={15} strokeWidth={1.75} aria-hidden="true" />
                <span>{t('home.orcaCreateCasual')}</span>
              </Button>
            </div>
            <p className="text-[11.5px] text-subtle leading-relaxed">
              {t('home.rankedHint')}
            </p>
          </div>
        ) : (
          <div>
            <Button
              variant="primary"
              size="md"
              onClick={() => onCreate(false, 'ranked')}
              className="w-full justify-center gap-2 h-9"
            >
              <Lock size={15} strokeWidth={1.75} aria-hidden="true" />
              <span>{t('home.orcaCreatePrivate')}</span>
            </Button>
          </div>
        )}
      </div>

      <div className="border-t border-line" />

      {/* Join with Code Form */}
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (trimmedCode) {
            onJoin(trimmedCode);
          }
        }}
      >
        <label htmlFor={roomCodeInputId} className="block text-xs font-medium text-ink">
          {t('home.joinWithCode')}
        </label>
        <div className="flex gap-2">
          <input
            id={roomCodeInputId}
            type="text"
            value={inputRoomCode}
            onChange={(e) => setInputRoomCode(e.target.value)}
            placeholder="ABC123"
            autoComplete="off"
            spellCheck={false}
            aria-label={t('home.joinWithCode')}
            className={cn(
              'flex-1 rounded-[6px] border border-line-strong bg-surface-2 px-3 py-1.5 text-xs text-ink placeholder:text-subtle transition-colors focus:border-accent focus:bg-surface focus:outline-hidden',
              inputRoomCode.includes('/')
                ? 'font-sans text-xs'
                : 'font-mono text-center uppercase tracking-widest',
            )}
          />
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={!trimmedCode}
            className="shrink-0 h-8"
          >
            {t('common.join')}
          </Button>
        </div>
      </form>

      <QrScanner isOpen={scanning} onClose={closeScanner} />
    </div>
  );
};
