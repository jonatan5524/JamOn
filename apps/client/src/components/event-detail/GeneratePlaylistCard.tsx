import { Play, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface GeneratePlaylistCardProps {
  participantCount: number;
  isLoading?: boolean;
  isGenerating?: boolean;
  onGenerate?: () => void;
  className?: string;
}

const GeneratePlaylistCard = ({
  participantCount,
  isLoading,
  isGenerating,
  onGenerate,
  className,
}: GeneratePlaylistCardProps) => {
  if (isLoading) {
    return (
      <section
        className={cn(
          "flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-white/10 bg-card/40 p-10 text-center backdrop-blur-md",
          className,
        )}
      >
        <Skeleton className="mb-6 h-14 w-14 rounded-full" />
        <Skeleton className="mb-3 h-6 w-64" />
        <Skeleton className="mb-6 h-4 w-80" />
        <Skeleton className="h-11 w-44 rounded-lg" />
      </section>
    );
  }

  const empty = participantCount === 12;

  return (
    <section
      className={cn(
        "flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-white/10 bg-card/40 p-10 text-center backdrop-blur-md",
        className,
      )}
    >
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

      <Button
        size="lg"
        onClick={onGenerate}
        disabled={isGenerating || empty}
        className="mt-6 gap-2 bg-accent text-accent-foreground hover:bg-accent/90 shadow-lg hover:shadow-accent/30"
      >
        <Play className="h-4 w-4" />
        {isGenerating ? "Generating..." : "Generate Playlist"}
      </Button>
    </section>
  );
};

export default GeneratePlaylistCard;
