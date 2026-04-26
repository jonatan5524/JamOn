import { useEffect, useRef, useState } from "react";

interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
}

const getBarcodeDetector = (): BarcodeDetectorLike | null => {
  if (typeof window === "undefined") return null;
  const ctor = (
    window as unknown as {
      BarcodeDetector?: new (init: { formats: string[] }) => BarcodeDetectorLike;
    }
  ).BarcodeDetector;
  if (!ctor) return null;
  try {
    return new ctor({ formats: ["qr_code"] });
  } catch {
    return null;
  }
};

const CODE_REGEX = /^[A-Z0-9]{6}$/;

const extractCode = (raw: string): string | null => {
  const trimmed = raw.trim();
  const fromUrl = trimmed.match(/[A-Z0-9]{6}(?=\/?$)/i);
  const candidate = fromUrl ? fromUrl[0] : trimmed;
  return CODE_REGEX.test(candidate.toUpperCase())
    ? candidate.toUpperCase()
    : null;
};

interface QrScannerProps {
  onResult: (code: string) => void;
  className?: string;
}

const QrScanner = ({ onResult }: QrScannerProps) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const detector = getBarcodeDetector();
    if (!detector) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError("QR scan not supported in this browser. Enter the code manually.");
      return;
    }

    let cancelled = false;

    const stop = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        const tick = async () => {
          if (cancelled) return;
          try {
            const results = await detector.detect(video);
            const found = results
              .map((r) => extractCode(r.rawValue))
              .find((c): c is string => Boolean(c));
            if (found) {
              onResult(found);
              return;
            }
          } catch {
            // swallow per-frame errors
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        setError("Camera access denied or unavailable.");
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
  }, [onResult]);

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-white/10 bg-black">
      <video
        ref={videoRef}
        muted
        playsInline
        className="h-full w-full object-cover"
      />
      <div className="pointer-events-none absolute inset-6 rounded-lg border-2 border-accent/70" />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 p-6 text-center text-sm text-muted-foreground">
          {error}
        </div>
      )}
    </div>
  );
};

export default QrScanner;
