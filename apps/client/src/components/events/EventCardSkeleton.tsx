import { Skeleton } from "@/components/ui/skeleton";

const EventCardSkeleton = () => (
  <div className="rounded-2xl border border-white/10 bg-card/40 p-5 backdrop-blur-md">
    <div className="mb-6 flex items-start justify-between">
      <Skeleton className="h-11 w-11 rounded-xl" />
      <Skeleton className="h-5 w-14 rounded-md" />
    </div>
    <Skeleton className="h-5 w-40" />
    <Skeleton className="mt-2 h-3.5 w-56" />
    <div className="mt-6 flex items-center justify-between border-t border-white/5 pt-4">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-4 w-4 rounded" />
    </div>
  </div>
);

export default EventCardSkeleton;
