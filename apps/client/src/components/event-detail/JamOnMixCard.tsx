import { ExternalLink, Music } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { JamOnMix, Participant } from "@/types/event";

interface JamOnMixCardProps {
  mix: JamOnMix | null | undefined;
  participants: Participant[];
  isLoading?: boolean;
  className?: string;
}

const ContributorChips = ({
  ids,
  participants,
}: {
  ids: string[];
  participants: Participant[];
}) => {
  const map = new Map(participants.map((p) => [p.id, p]));
  return (
    <div className="flex -space-x-1.5">
      {ids.map((id) => {
        const p = map.get(id);
        if (!p) return null;
        return (
          <span
            key={id}
            className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-white ring-2 ring-card/60"
            style={{ backgroundColor: p.colorHex }}
            title={p.name}
          >
            {p.initial}
          </span>
        );
      })}
    </div>
  );
};

const TrackRowSkeleton = () => (
  <li className="flex items-center gap-4 px-3 py-3">
    <Skeleton className="h-4 w-3" />
    <Skeleton className="h-9 w-9 rounded-md" />
    <div className="flex-1 space-y-1">
      <Skeleton className="h-3.5 w-40" />
      <Skeleton className="h-3 w-24" />
    </div>
    <Skeleton className="h-5 w-16 rounded-full" />
  </li>
);

const JamOnMixCard = ({
  mix,
  participants,
  isLoading,
  className,
}: JamOnMixCardProps) => {
  return (
    <section
      className={cn(
        "rounded-2xl border border-white/10 bg-card/40 p-5 backdrop-blur-md",
        className,
      )}
    >
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">
            Your JamOn Mix
          </h2>
          {isLoading ? (
            <Skeleton className="mt-1 h-3 w-28" />
          ) : (
            <p className="text-xs text-muted-foreground">
              {mix?.trackCount ?? 0} tracks · ~{mix?.durationMin ?? 0} min
            </p>
          )}
        </div>
        {isLoading ? (
          <Skeleton className="h-9 w-32 rounded-md" />
        ) : mix?.spotifyUrl ? (
          <Button
            asChild
            size="sm"
            variant="outline"
            className="gap-2 border-accent/40 text-accent hover:bg-accent/10 hover:text-accent"
          >
            <a href={mix.spotifyUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              Open in Spotify
            </a>
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled
            className="gap-2 border-accent/40 text-accent"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open in Spotify
          </Button>
        )}
      </header>

      <ul className="flex flex-col divide-y divide-white/5">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => <TrackRowSkeleton key={i} />)
          : (mix?.tracks ?? []).map((track) => (
              <li
                key={track.id}
                className="flex items-center gap-4 px-3 py-3 transition-colors hover:bg-white/5"
              >
                <span className="w-3 text-right text-xs text-muted-foreground">
                  {track.position}
                </span>
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent/15 text-accent">
                  <Music className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {track.title}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {track.artist}
                  </p>
                </div>
                <ContributorChips
                  ids={track.contributorIds}
                  participants={participants}
                />
              </li>
            ))}
      </ul>
    </section>
  );
};

export default JamOnMixCard;
