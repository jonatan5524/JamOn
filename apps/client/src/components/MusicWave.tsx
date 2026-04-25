import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

type MusicWaveProps = {
  className?: string;
  barCount?: number;
};

const MusicWave = ({ className, barCount = 5 }: MusicWaveProps) => {
  const bars = Array.from({ length: Math.max(1, barCount) });

  return (
    <div
      className={cn("flex items-end gap-2 h-16", className)}
      aria-hidden="true"
    >
      {bars.map((_, index) => (
        <motion.span
          key={index}
          className="w-1.5 rounded-full bg-gradient-to-t from-primary/60 to-accent"
          initial={{ height: 16 }}
          animate={{
            height: [16, 42, 20, 52, 16],
            opacity: [0.5, 1, 0.8, 1, 0.5],
          }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            ease: "easeInOut",
            delay: index * 0.1,
          }}
        />
      ))}
    </div>
  );
};

export default MusicWave;
