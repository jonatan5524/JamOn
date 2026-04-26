import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface EventCodeBadgeProps {
  code: string;
  className?: string;
}

const EventCodeBadge = ({ code, className }: EventCodeBadgeProps) => (
  <div className={cn("flex items-center gap-2 text-xs sm:text-sm", className)}>
    <span className="text-muted-foreground">Event Code:</span>
    <span className="font-mono font-semibold tracking-widest text-accent">
      {code}
    </span>
  </div>
);

export const EventCodeBadgeSkeleton = ({
  className,
}: {
  className?: string;
}) => (
  <div className={cn("flex items-center gap-2", className)}>
    <Skeleton className="h-3 w-16" />
    <Skeleton className="h-3 w-16" />
  </div>
);

export default EventCodeBadge;
