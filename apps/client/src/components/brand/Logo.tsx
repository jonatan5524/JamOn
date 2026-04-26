import { useState } from "react";
import { Link } from "react-router-dom";
import WaveMark from "@/components/brand/WaveMark";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  showWordmark?: boolean;
  to?: string;
}

const Logo = ({ className, showWordmark = true, to = "/" }: LogoProps) => {
  const [hovered, setHovered] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  return (
    <Link
      to={to}
      aria-label="JamOn home"
      className={cn(
        "flex items-center gap-2 rounded-md transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        className,
      )}
      onMouseEnter={() => {
        setHovered(true);
        setHasInteracted(true);
      }}
      onMouseLeave={() => setHovered(false)}
    >
      <WaveMark hovered={hovered} hasInteracted={hasInteracted} />
      {showWordmark && (
        <span className="font-display text-lg font-bold tracking-tight">
          JamOn
        </span>
      )}
    </Link>
  );
};

export default Logo;
