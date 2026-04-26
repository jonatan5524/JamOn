import { UserPlus, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Participant } from "@/types/event";

interface ParticipantsCardProps {
  participants: Participant[];
  isLoading?: boolean;
  className?: string;
}

const ActivityBars = ({ value }: { value: number }) => {
  const bars = 4;
  const active = Math.max(1, Math.round(value * bars));
  return (
    <div className="flex items-end gap-0.5">
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "w-0.5 rounded-sm",
            i < active ? "bg-accent" : "bg-white/10",
          )}
          style={{ height: `${6 + i * 3}px` }}
        />
      ))}
    </div>
  );
};

const ParticipantRow = ({ participant }: { participant: Participant }) => (
  <li className="flex items-center gap-3 rounded-lg border border-transparent bg-transparent px-2 py-2 hover:border-white/5 hover:bg-white/5">
    <span
      className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
      style={{ backgroundColor: participant.colorHex }}
    >
      {participant.initial}
    </span>
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium text-foreground">
        {participant.name}
      </p>
      <p className="truncate text-[11px] text-muted-foreground">
        Connected via Spotify
      </p>
    </div>
    <ActivityBars value={participant.activity} />
  </li>
);

const ParticipantSkeletonRow = () => (
  <li className="flex items-center gap-3 px-2 py-2">
    <Skeleton className="h-8 w-8 rounded-full" />
    <div className="flex-1 space-y-1">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-2.5 w-28" />
    </div>
    <Skeleton className="h-4 w-6" />
  </li>
);

const ParticipantsCard = ({
  participants,
  isLoading,
  className,
}: ParticipantsCardProps) => {
  return (
    <section
      className={cn(
        "rounded-2xl border border-white/10 bg-card/40 p-5 backdrop-blur-md",
        className,
      )}
    >
      <header className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Users className="h-4 w-4 text-accent" />
        Participants ({isLoading ? "—" : participants.length})
      </header>

      {isLoading ? (
        <ul className="flex flex-col gap-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <ParticipantSkeletonRow key={i} />
          ))}
        </ul>
      ) : participants.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-2 py-6 text-center">
          <UserPlus className="h-5 w-5 text-muted-foreground/60" />
          <p className="text-xs text-muted-foreground">
            No one has joined yet
          </p>
          <p className="text-[11px] text-muted-foreground/70">
            Share the invite link or QR to get started
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          {participants.map((p) => (
            <ParticipantRow key={p.id} participant={p} />
          ))}
        </ul>
      )}
    </section>
  );
};

export default ParticipantsCard;
