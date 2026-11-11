import React, { useEffect, useRef, useState } from 'react';
import { CameraOff, Loader2, X } from 'lucide-react';
import { useModalChrome } from '../../shared/hooks/useModalChrome';
import { useT } from '../i18n/language';
import { pairErrorKey, type PairError } from './pairErrors';
import { decodePairLink, encodePairLink } from './pairLink';

/** How often a camera frame is checked for a code. */
const SCAN_INTERVAL_MS = 200;
/** Frames are scaled down to this many pixels on their long side before jsQR reads them. */
const FALLBACK_FRAME_PX = 640;

type DecodeFrame = (video: HTMLVideoElement) => Promise<string | null>;

interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>>;
}
type BarcodeDetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorLike;

/** The browser's own QR reader where there is one, else jsQR over canvas frames (iOS Safari). */
const createFrameDecoder = async (): Promise<DecodeFrame> => {
  const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (Detector) {
    try {
      const detector = new Detector({ formats: ['qr_code'] });
      return async (video) => (await detector.detect(video))[0]?.rawValue ?? null;
    } catch {
      // QR is not among this browser's formats: fall back to jsQR.
    }
  }
  const { default: jsQR } = await import('jsqr');
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  return async (video) => {
    const { videoWidth: width, videoHeight: height } = video;
    if (!context || !width || !height) return null;
    const scale = Math.min(1, FALLBACK_FRAME_PX / Math.max(width, height));
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frame = context.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
  };
};

interface QrScannerProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Full-screen camera view that reads the desktop's pairing QR and opens it. */
export const QrScanner: React.FC<QrScannerProps> = ({ isOpen, onClose }) => {
  const t = useT();
  const dialogProps = useModalChrome(isOpen, onClose, 'qr-scanner-title');
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<PairError | null>(null);
  const [starting, setStarting] = useState(true);
  // Read through a ref so a parent re-render never restarts the camera.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!isOpen || !video) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    setError(null);
    setStarting(true);

    const stopCamera = () => {
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
    };

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera API');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      } catch {
        if (!stopped) {
          setError('camera_denied');
          setStarting(false);
        }
        return;
      }
      if (stopped) {
        stopCamera();
        return;
      }
      video.srcObject = stream;
      await video.play().catch(() => {});
      const decode = await createFrameDecoder();
      if (stopped) return;
      setStarting(false);

      const scan = async () => {
        let text: string | null = null;
        try {
          text = await decode(video);
        } catch {
          // The frame was not ready; try the next one.
        }
        if (stopped) return;
        if (text) {
          const offer = decodePairLink(text);
          if (offer) {
            stopped = true;
            stopCamera();
            // Rebuilt on this app's own origin, so a code can never send the phone elsewhere.
            window.location.assign(encodePairLink(window.location.origin, offer));
            onCloseRef.current();
            return;
          }
          setError('invalid_qr');
        }
        timer = window.setTimeout(() => void scan(), SCAN_INTERVAL_MS);
      };
      void scan();
    };
    start().catch((cause: unknown) => console.warn('pairing: the QR scanner could not start', cause));

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stopCamera();
      video.srcObject = null;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div {...dialogProps} className="fixed inset-0 z-[70] flex flex-col bg-black text-white">
      <div className="flex items-center justify-between gap-3 p-4">
        <h2 id="qr-scanner-title" className="text-lg font-semibold">{t('pair.scanTitle')}</h2>
        <button type="button" onClick={onClose} className="btn btn-ghost btn-icon text-white" aria-label={t('common.close')}>
          <X size={20} strokeWidth={2.25} aria-hidden="true" />
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted aria-hidden="true" />
        {error !== 'camera_denied' && (
          <div aria-hidden="true" className="pointer-events-none absolute h-64 w-64 max-w-[80vw] max-h-[80vw] rounded-lg border-4 border-white/80" />
        )}
        {starting && error === null && (
          <Loader2 size={32} className="absolute animate-spin text-white/80" aria-hidden="true" />
        )}
        {error === 'camera_denied' && (
          <div role="alert" className="absolute inset-x-4 flex flex-col items-center gap-3 text-center">
            <CameraOff size={36} strokeWidth={2} aria-hidden="true" />
            <p className="text-sm">{t(pairErrorKey('camera_denied'))}</p>
            <p className="text-sm text-white/70">{t('pair.useCameraApp')}</p>
          </div>
        )}
      </div>

      {error === 'invalid_qr' && (
        <p role="status" className="p-4 text-center text-sm text-white/90">{t(pairErrorKey('invalid_qr'))}</p>
      )}
    </div>
  );
};
