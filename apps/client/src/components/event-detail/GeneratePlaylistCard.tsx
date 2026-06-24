import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Play, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface GeneratePlaylistCardProps {
  participantCount: number;
  /** Only the event host (creator) may trigger generation. */
  isCreator?: boolean;
  isLoading?: boolean;
  isGenerating?: boolean;
  onGenerate?: () => void;
  className?: string;
}

const SHELL =
  "flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-white/10 bg-card/40 p-10 text-center backdrop-blur-md";

const STAGES = [
  "Analyzing everyone's taste…",
  "Matching the vibe…",
  "Building your mix…",
  "Finalizing your playlist…",
] as const;

const STAGE_INTERVAL_MS = 2800;

const GeneratingState = () => {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setStage((s) => {
        if (s >= STAGES.length - 1) {
          clearInterval(id);
          return s;
        }
        return s + 1;
      });
    }, STAGE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center"
    >
      <div className="relative mb-6 flex h-16 w-16 items-center justify-center">
        <motion.div
          className="absolute inset-0 rounded-full bg-accent/20 blur-md"
          animate={{ scale: [1, 1.25, 1], opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="relative flex h-14 w-14 items-center justify-center rounded-full bg-accent/15 text-accent"
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        >
          <Sparkles className="h-7 w-7" />
        </motion.div>
      </div>

      <h2 className="font-display text-2xl font-bold text-foreground">
        Creating your mix
      </h2>

      <div className="mt-2 flex h-5 items-center">
        <AnimatePresence mode="wait">
          <motion.p
            key={stage}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.4 }}
            className="text-sm text-muted-foreground"
          >
            {STAGES[stage]}
          </motion.p>
        </AnimatePresence>
      </div>

      <div className="relative mt-6 h-1 w-56 overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="absolute inset-y-0 w-1/3 rounded-full bg-accent"
          animate={{ x: ["-100%", "300%"] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <p className="mt-4 max-w-xs text-xs text-muted-foreground/70">
        This can take up to a minute while our AI blends everyone's taste.
      </p>
    </motion.div>
  );
};

const GeneratePlaylistCard = ({
  participantCount,
  isCreator = false,
  isLoading,
  isGenerating,
  onGenerate,
  className,
}: GeneratePlaylistCardProps) => {
  if (isLoading) {
    return (
      <section className={cn(SHELL, className)}>
        <Skeleton className="mb-6 h-14 w-14 rounded-full" />
        <Skeleton className="mb-3 h-6 w-64" />
        <Skeleton className="mb-6 h-4 w-80" />
        <Skeleton className="h-11 w-44 rounded-lg" />
      </section>
    );
  }

  if (isGenerating) {
    return (
      <section className={cn(SHELL, className)}>
        <GeneratingState />
      </section>
    );
  }

  const empty = participantCount === 0;

  return (
    <section className={cn(SHELL, className)}>
      <div
        className={cn(
          "mb-6 flex h-14 w-14 items-center justify-center rounded-full",
          empty
            ? "bg-white/5 text-muted-foreground"
            : "bg-accent/15 text-accent",
        )}
      >
        {empty ? (
          <Users className="h-7 w-7" />
        ) : (
          <Sparkles className="h-7 w-7" />
        )}
      </div>

      <h2 className="font-display text-2xl font-bold text-foreground">
        {empty ? "Waiting for Participants" : "Ready to Generate Your Playlist"}
      </h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        {empty
          ? "Share the invite link or QR with friends. Once they join, you can generate a playlist together."
          : `${participantCount} participant${participantCount === 1 ? "" : "s"} connected. Our AI will analyze everyone's taste and create the perfect mix.`}
      </p>

      {isCreator ? (
        <Button
          size="lg"
          onClick={onGenerate}
          disabled={isGenerating || empty}
          className="mt-6 gap-2 bg-accent text-accent-foreground hover:bg-accent/90 shadow-lg hover:shadow-accent/30"
        >
          <Play className="h-4 w-4" />
          {isGenerating ? "Generating..." : "Generate Playlist"}
        </Button>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">
          Waiting for the host to generate the playlist…
        </p>
      )}
    </section>
  );
};

export default GeneratePlaylistCard;
