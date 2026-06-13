import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { TasteContribution } from "@/types/event";

interface TasteContributionsCardProps {
  contributions: TasteContribution[];
  playlistMatchPercent?: number;
  isLoading?: boolean;
  className?: string;
}

const ContributionRow = ({ row }: { row: TasteContribution }) => (
  <li className="space-y-1.5">
    <div className="flex items-center justify-between text-xs">
      <span className="text-foreground">{row.participantName}</span>
      <span className="text-muted-foreground">{row.percent}%</span>
    </div>
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
      <div
        className="h-full rounded-full"
        style={{ width: `${row.percent}%`, backgroundColor: row.colorHex }}
      />
    </div>
  </li>
);

const SkeletonRow = () => (
  <li className="space-y-1.5">
    <div className="flex items-center justify-between">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-3 w-8" />
    </div>
    <Skeleton className="h-1.5 w-full rounded-full" />
  </li>
);

const TasteContributionsCard = ({
  contributions,
  playlistMatchPercent,
  isLoading,
  className,
}: TasteContributionsCardProps) => {
  return (
    <section
      className={cn(
        "rounded-2xl border border-white/10 bg-card/40 p-5 backdrop-blur-md",
        className,
      )}
    >
      <header className="mb-4 flex items-center justify-between gap-3 text-sm font-semibold text-foreground">
        <span>Taste Contributions</span>
        {!isLoading && playlistMatchPercent !== undefined ? (
          <span className="text-xs font-medium text-accent">
            {playlistMatchPercent}% match
          </span>
        ) : null}
      </header>
      <ul className="flex flex-col gap-3">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)
          : contributions.map((row) => (
              <ContributionRow key={row.participantId} row={row} />
            ))}
      </ul>
    </section>
  );
};

export default TasteContributionsCard;
