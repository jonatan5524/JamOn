import { motion } from "framer-motion";
import { ArrowLeft, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EventAccessDeniedProps {
  className?: string;
}

const EventAccessDenied = ({ className }: EventAccessDeniedProps) => {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={cn(
        "flex min-h-[70vh] flex-col items-center justify-center px-6 py-16 text-center",
        className,
      )}
    >
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-accent">
        <Lock className="h-7 w-7" />
      </div>
      <h3 className="font-display text-xl font-semibold text-foreground">
        You don&apos;t have access
      </h3>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        You&apos;re not a member of this event. Join with the event code to get
        in.
      </p>

      <div className="mt-6">
        <Button
          size="sm"
          onClick={() => navigate("/")}
          className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90 shadow-lg hover:shadow-accent/30"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to events
        </Button>
      </div>
    </motion.div>
  );
};

export default EventAccessDenied;
