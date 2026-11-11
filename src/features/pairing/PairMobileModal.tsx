import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Smartphone, X } from 'lucide-react';
import QRCode from 'qrcode';
import { useModalChrome } from '../../shared/hooks/useModalChrome';
import { useT } from '../i18n/language';

interface PairMobileModalProps {
  isOpen: boolean;
  link: string | null;
  secondsLeft: number;
  phoneConnected: boolean;
  onClose: () => void;
  onUnpair: () => void;
}

/** The desktop's "Pair mobile" dialog: a QR the phone scans, and the pairing's status. */
export const PairMobileModal: React.FC<PairMobileModalProps> = ({ isOpen, link, secondsLeft, phoneConnected, onClose, onUnpair }) => {
  const t = useT();
  const dialogProps = useModalChrome(isOpen, onClose, 'pair-mobile-modal-title');
  const [qr, setQr] = useState<{ link: string; dataUrl: string } | null>(null);

  useEffect(() => {
    if (!isOpen || !link) return;
    let cancelled = false;
    QRCode.toDataURL(link, { errorCorrectionLevel: 'M', margin: 4, scale: 6 })
      .then((dataUrl) => {
        if (!cancelled) setQr({ link, dataUrl });
      })
      .catch((error: unknown) => console.warn('pairing: could not draw the QR code', error));
    return () => {
      cancelled = true;
    };
  }, [isOpen, link]);

  if (!isOpen) return null;
  // A code drawn for a secret that has since rotated is never shown.
  const dataUrl = qr && qr.link === link ? qr.dataUrl : null;

  return (
    <div {...dialogProps} className="modal-scrim">
      <div className="modal-panel max-w-sm max-h-[calc(100dvh-2rem)] p-4 sm:p-6 flex flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-line pb-3 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <Smartphone size={18} strokeWidth={2.25} aria-hidden="true" className="text-muted" />
            <h2 id="pair-mobile-modal-title" className="text-xl text-ink">{t('pair.title')}</h2>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-icon" aria-label={t('common.close')}>
            <X size={18} strokeWidth={2.25} aria-hidden="true" />
          </button>
        </div>

        <p className="text-sm text-muted mb-4">{t('pair.instructions')}</p>

        <div className="mx-auto flex h-64 w-64 items-center justify-center rounded-lg border border-line bg-white">
          {dataUrl ? (
            <img src={dataUrl} alt={t('pair.title')} width={256} height={256} className="h-64 w-64 rounded-lg" />
          ) : (
            <Loader2 size={24} className="animate-spin text-muted" aria-hidden="true" />
          )}
        </div>

        <p className="mt-2 text-center font-mono text-xs text-muted">
          {t('pair.refreshesIn', { seconds: secondsLeft })}
        </p>

        {phoneConnected && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-line bg-surface-2 px-3 py-2">
            <span className="flex items-center gap-2 text-sm font-semibold text-emerald-600">
              <CheckCircle2 size={16} strokeWidth={2.25} aria-hidden="true" />
              {t('pair.connected')}
            </span>
            <button type="button" onClick={onUnpair} className="btn btn-ghost text-danger hover:text-danger">
              {t('pair.unpair')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
