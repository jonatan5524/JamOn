import { motion } from "framer-motion";
import { LogIn, Music, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyEventsProps {
  onNewEvent?: () => void;
  onJoinEvent?: () => void;
  className?: string;
}

const EmptyEvents = ({ onNewEvent, onJoinEvent, className }: EmptyEventsProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-card/30 px-6 py-16 text-center backdrop-blur-md",
        className,
      )}
    >
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-accent">
        <Music className="h-7 w-7" />
      </div>
      <h3 className="font-display text-xl font-semibold text-foreground">
        No events yet
      </h3>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Create your first event or join one with a code from a friend.
      </p>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <Button
          size="sm"
          onClick={onNewEvent}
          className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90 shadow-lg hover:shadow-accent/30"
        >
          <Plus className="h-4 w-4" />
          New Event
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onJoinEvent}
          className="gap-2 border-white/15"
        >
          <LogIn className="h-4 w-4" />
          Join Event
        </Button>
      </div>
    </motion.div>
  );
};

export default EmptyEvents;
