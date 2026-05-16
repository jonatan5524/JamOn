import { useCallback, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Camera, Keyboard, LogIn } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { findEventByCode } from "@/lib/mockApi";
import { Button } from "@/components/ui/button";
import CodeInput from "@/components/ui/code-input";
import Modal from "@/components/ui/modal";
import QrScanner from "@/components/events/QrScanner";
import { cn } from "@/lib/utils";
import type { EventSummary } from "@/types/event";

const CODE_LENGTH = 6;
const CODE_REGEX = /^[A-Z0-9]{6}$/;

type Mode = "code" | "scan";

interface JoinEventDialogProps {
  open: boolean;
  onClose: () => void;
}

const JoinEventForm = ({ onClose }: { onClose: () => void }) => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("code");
  const [code, setCode] = useState("");
  const [touched, setTouched] = useState(false);

  const findMutation = useMutation<EventSummary, Error, string>({
    mutationFn: (input) => findEventByCode(input),
    onSuccess: (event) => {
      onClose();
      navigate(`/events/${event.id}`);
    },
  });

  const valid = CODE_REGEX.test(code);
  const showError =
    (touched && !valid && code.length > 0) || findMutation.isError;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    findMutation.mutate(code);
  };

  const handleScanResult = useCallback(
    (scanned: string) => {
      setCode(scanned);
      setMode("code");
      findMutation.mutate(scanned);
    },
    [findMutation],
  );

  return (
    <>
      <header className="mb-5">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <LogIn className="h-5 w-5" />
        </div>
        <h2 className="font-display text-xl font-semibold text-foreground">
          Join an Event
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter the 6-character code or scan a QR.
        </p>
      </header>

      <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg border border-white/5 bg-background/40 p-1">
        <button
          type="button"
          onClick={() => setMode("code")}
          className={cn(
            "flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            mode === "code"
              ? "bg-accent/15 text-accent"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Keyboard className="h-3.5 w-3.5" />
          Enter code
        </button>
        <button
          type="button"
          onClick={() => setMode("scan")}
          className={cn(
            "flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            mode === "scan"
              ? "bg-accent/15 text-accent"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Camera className="h-3.5 w-3.5" />
          Scan QR
        </button>
      </div>

      {mode === "code" ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <p className="mb-3 text-center text-xs font-medium text-muted-foreground">
              Event Code
            </p>
            <CodeInput
              value={code}
              onChange={(v) => {
                setCode(v);
                setTouched(true);
              }}
              length={CODE_LENGTH}
              autoFocus
              invalid={showError}
              onComplete={(v) => findMutation.mutate(v)}
            />
            {showError && (
              <p className="mt-3 text-center text-xs text-destructive">
                {findMutation.isError
                  ? "Event not found. Check the code."
                  : "Code must be 6 letters or numbers."}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!valid || findMutation.isPending}
              className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
            >
              <LogIn className="h-4 w-4" />
              {findMutation.isPending ? "Joining..." : "Join Event"}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-4">
          <QrScanner onResult={handleScanResult} />
          <p className="text-xs text-muted-foreground">
            Point your camera at the host&apos;s QR code.
          </p>
          <div className="flex justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </>
  );
};

const JoinEventDialog = ({ open, onClose }: JoinEventDialogProps) => (
  <Modal open={open} onClose={onClose} ariaLabel="Join Event">
    {open && <JoinEventForm onClose={onClose} />}
  </Modal>
);

export default JoinEventDialog;
