import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface GroupMatchCardProps {
  percent?: number;
  isLoading?: boolean;
  className?: string;
}

const GroupMatchCard = ({
  percent = 0,
  isLoading,
  className,
}: GroupMatchCardProps) => (
  <section
    className={cn(
      "rounded-2xl border border-white/10 bg-card/40 p-5 backdrop-blur-md",
      className,
    )}
  >
    <header className="mb-4 text-sm font-semibold text-foreground">
      Group match
    </header>
    {isLoading ? (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-8" />
        </div>
        <Skeleton className="h-1.5 w-full rounded-full" />
      </div>
    ) : (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-foreground">Playlist fit</span>
          <span className="text-muted-foreground">{percent}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    )}
  </section>
);

export default GroupMatchCard;
