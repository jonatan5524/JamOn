import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const REST_PATH = "M2 16 Q 8 4, 14 16 T 26 16 T 38 16 T 50 16 T 62 16";
const DOWN_PATH = "M2 16 Q 8 28, 14 16 T 26 16 T 38 16 T 50 16 T 62 16";
const UP_PATH = "M2 16 Q 8 -12, 14 16 T 26 16 T 38 16 T 50 16 T 62 16";

const FORWARD_FRAMES = [REST_PATH, DOWN_PATH, UP_PATH, REST_PATH];
const REVERSE_FRAMES = [...FORWARD_FRAMES].reverse();

interface WaveMarkProps {
  hovered?: boolean;
  hasInteracted?: boolean;
  className?: string;
}

const WaveMark = ({ hovered, hasInteracted, className }: WaveMarkProps) => {
  const target = hovered
    ? FORWARD_FRAMES
    : hasInteracted
      ? REVERSE_FRAMES
      : REST_PATH;

  return (
    <svg
      viewBox="-10 -16 84 64"
      className={cn("h-12 w-16 overflow-visible", className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id="waveMarkGradient"
          x1="0%"
          y1="0%"
          x2="100%"
          y2="0%"
        >
          <stop offset="0%" stopColor="hsl(var(--primary))" />
          <stop offset="50%" stopColor="hsl(var(--accent))" />
          <stop offset="100%" stopColor="hsl(var(--primary))" />
        </linearGradient>
        <filter
          id="waveMarkGlow"
          x="-50%"
          y="-50%"
          width="200%"
          height="200%"
        >
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
      </defs>

      <motion.path
        d={REST_PATH}
        stroke="hsl(158 65% 62%)"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
        filter="url(#waveMarkGlow)"
        initial={false}
        animate={{ d: target, opacity: hovered ? 0.9 : 0 }}
        transition={{ duration: 0.9, ease: "easeInOut" }}
      />

      <motion.path
        d={REST_PATH}
        stroke="url(#waveMarkGradient)"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
        initial={false}
        animate={{ d: target }}
        transition={{ duration: 0.9, ease: "easeInOut" }}
      />
    </svg>
  );
};

export default WaveMark;
