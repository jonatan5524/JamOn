import { motion } from "framer-motion";
import { ArrowRight, Music, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EventSummary } from "@/types/event";

interface EventCardProps {
  event: EventSummary;
  onClick?: (event: EventSummary) => void;
  className?: string;
  index?: number;
}

const EventCard = ({ event, onClick, className, index = 0 }: EventCardProps) => {
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      whileHover={{ y: -4 }}
      onClick={() => onClick?.(event)}
      className={cn(
        "group relative w-full overflow-hidden rounded-2xl border border-white/10 bg-card/40 p-5 text-left backdrop-blur-md transition-colors",
        "hover:border-accent/40 hover:bg-card/60",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        className,
      )}
    >
      <div className="mb-6 flex items-start justify-between">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <Music className="h-5 w-5" />
        </div>
        <span className="rounded-md bg-white/5 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {event.code}
        </span>
      </div>

      <h3 className="font-display text-lg font-semibold text-foreground">
        {event.name}
      </h3>
      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
        {event.description}
      </p>

      <div className="mt-6 flex items-center justify-between border-t border-white/5 pt-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          <span>
            {event.participantCount} participant
            {event.participantCount === 1 ? "" : "s"}
          </span>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-accent" />
      </div>
    </motion.button>
  );
};

export default EventCard;
