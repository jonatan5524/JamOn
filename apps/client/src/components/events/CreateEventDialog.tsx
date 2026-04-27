import { useState } from "react";
import { ArrowLeft, ArrowRight, Sparkles, Wand2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCreateEvent } from "@/hooks/use-event";
import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "Sunset rooftop vibes with deep house and chill electronic",
  "High energy pop and dance for a birthday party",
  "Lo-fi beats and indie folk for focused studying",
  "Late night drive with synthwave and dreamy pop",
  "Backyard BBQ with classic rock and country",
];

const NAME_MAX = 60;
const DESC_MAX = 200;

interface CreateEventDialogProps {
  open: boolean;
  onClose: () => void;
}

const StepIndicator = ({ step }: { step: 1 | 2 }) => (
  <div className="mb-6 mr-10 flex gap-2">
    {[1, 2].map((s) => (
      <div
        key={s}
        className={cn(
          "h-1 flex-1 rounded-full transition-colors",
          s <= step ? "bg-accent" : "bg-white/10",
        )}
      />
    ))}
  </div>
);

const CreateEventForm = ({ onClose }: { onClose: () => void }) => {
  const navigate = useNavigate();
  const createMutation = useCreateEvent();
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const trimmedName = name.trim();
  const trimmedDesc = description.trim();
  const canContinue = trimmedName.length > 0;
  const canCreate = trimmedDesc.length > 0;

  const handleContinue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canContinue) return;
    setStep(2);
  };

  const handleCreate = () => {
    if (!canCreate) return;
    createMutation.mutate(
      { name: trimmedName, description: trimmedDesc },
      {
        onSuccess: (event) => {
          onClose();
          navigate(`/events/${event.id}`);
        },
      },
    );
  };

  return (
    <>
      <StepIndicator step={step} />

      {step === 1 ? (
        <form onSubmit={handleContinue} className="flex flex-col gap-5">
          <div>
            <h2 className="font-display text-xl font-semibold text-foreground">
              Name Your Event
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Give your gathering a memorable name.
            </p>
          </div>

          <div>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, NAME_MAX))}
              placeholder="e.g. Sara's Birthday Bash"
              className={cn(
                "w-full rounded-lg border border-white/10 bg-background/50 px-4 py-3 text-base text-foreground placeholder:text-muted-foreground/50",
                "focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/30",
              )}
            />
            <div className="mt-1.5 text-right text-[11px] text-muted-foreground">
              {name.length}/{NAME_MAX}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!canContinue}
              className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
            >
              Continue
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-5">
          <div>
            <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-foreground">
              <Sparkles className="h-5 w-5 text-accent" />
              Describe the Vibe
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Tell us about the atmosphere you want to create. Our AI will
              translate this into the perfect sound.
            </p>
          </div>

          <div>
            <textarea
              autoFocus
              value={description}
              onChange={(e) =>
                setDescription(e.target.value.slice(0, DESC_MAX))
              }
              placeholder="A chill rooftop party at sunset with close friends"
              rows={4}
              className={cn(
                "w-full resize-none rounded-lg border border-white/10 bg-background/50 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50",
                "focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/30",
              )}
            />
            <div className="mt-1.5 text-right text-[11px] text-muted-foreground">
              {description.length}/{DESC_MAX}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Try these:
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setDescription(s.slice(0, DESC_MAX))}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-accent/40 hover:bg-accent/10 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {createMutation.isError && (
            <p className="text-xs text-destructive">
              Failed to create event. Try again.
            </p>
          )}

          <div className="flex justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setStep(1)}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!canCreate || createMutation.isPending}
              onClick={handleCreate}
              className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
            >
              <Wand2 className="h-4 w-4" />
              {createMutation.isPending ? "Creating..." : "Create Event"}
            </Button>
          </div>
        </div>
      )}
    </>
  );
};

const CreateEventDialog = ({ open, onClose }: CreateEventDialogProps) => (
  <Modal
    open={open}
    onClose={onClose}
    ariaLabel="Create Event"
    className="max-w-lg"
  >
    {open && <CreateEventForm onClose={onClose} />}
  </Modal>
);

export default CreateEventDialog;
