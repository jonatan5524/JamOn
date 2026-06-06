import { ArrowLeft, LogIn, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Logo from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TopNavProps {
  onNewEvent?: () => void;
  onJoinEvent?: () => void;
  showBack?: boolean;
  showActions?: boolean;
  rightSlot?: React.ReactNode;
  className?: string;
}

const TopNav = ({
  onNewEvent,
  onJoinEvent,
  showBack = true,
  showActions = true,
  rightSlot,
  className,
}: TopNavProps) => {
  const navigate = useNavigate();

  const handleBack = () => navigate(-1);

  return (
    <header
      className={cn(
        "sticky top-0 z-20 border-b border-white/10 bg-background/40 backdrop-blur-md",
        className,
      )}
    >
      <div className="flex w-full items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          {showBack && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBack}
              aria-label="Back"
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <Logo />
        </div>

        <div className="flex items-center gap-2">
          {rightSlot}
          {showActions && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/my-events")}
                className="gap-2 border-white/15"
              >
                My Events
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onJoinEvent}
                className="gap-2 border-white/15"
              >
                <LogIn className="h-4 w-4" />
                Join
              </Button>
              <Button
                size="sm"
                onClick={onNewEvent}
                className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90 shadow-lg hover:shadow-accent/30"
              >
                <Plus className="h-4 w-4" />
                New Event
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default TopNav;
