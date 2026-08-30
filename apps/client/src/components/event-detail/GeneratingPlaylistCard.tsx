import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Music, Music2, Music3, Music4 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SHELL } from "./GeneratePlaylistCard";

interface GeneratingPlaylistCardProps {
  eventName?: string;
  className?: string;
}

const STATUS_LINES = [
  "Putting together the perfect playlist for you",
  "Ooh, this one's a keeper",
  "This artist is spot on for tonight",
  "Get the speakers ready, this is going to be good",
  "Digging through everyone's favorite tracks",
  "Found one that fits the mood perfectly",
  "Lining up the vibe, song by song",
  "Your crowd has great taste, by the way",
  "Pairing everyone's picks into one set",
  "Cueing up something special",
];
const LONG_WAIT_LINE = "Still working — good mixes are worth the wait";

const STATUS_INTERVAL_MS = 3800;
const LONG_WAIT_MS = 75_000;

const NOTE_GLYPHS = [Music, Music2, Music3, Music4];
const NOTE_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(158 65% 62%)",
  "hsl(180 70% 40%)",
];
const MAX_NOTES = 12;

interface Note {
  id: number;
  Glyph: (typeof NOTE_GLYPHS)[number];
  color: string;
  originX: number;
  originY: number;
  driftX: number;
  driftY: number;
  rotate: number;
  scale: number;
  duration: number;
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(arr: readonly T[]): T =>
  arr[Math.floor(Math.random() * arr.length)];

const shuffle = <T,>(arr: readonly T[]): T[] => {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

const makeNote = (id: number): Note => {
  // Origin somewhere between the label edge and the outer groove.
  const angle = rand(0, Math.PI * 2);
  const radius = rand(34, 88);
  const driftMag = rand(55, 110);
  return {
    id,
    Glyph: pick(NOTE_GLYPHS),
    color: pick(NOTE_COLORS),
    originX: Math.cos(angle) * radius,
    originY: Math.sin(angle) * radius,
    // Fly outward along the origin ray, with a slight upward bias.
    driftX: Math.cos(angle) * driftMag + rand(-16, 16),
    driftY: Math.sin(angle) * driftMag + rand(-16, 16) - rand(10, 34),
    rotate: rand(-40, 40),
    scale: rand(0.8, 1.25),
    duration: rand(1.8, 3),
  };
};

const truncateName = (name: string | undefined): string => {
  const clean = (name ?? "").trim();
  if (!clean) return "JamOn";
  return clean.length > 16 ? `${clean.slice(0, 15).trimEnd()}…` : clean;
};

const GROOVE_RADII = [78, 68, 58, 48, 40];

const GeneratingPlaylistCard = ({
  eventName,
  className,
}: GeneratingPlaylistCardProps) => {
  const reduce = useReducedMotion();

  const [statusOrder] = useState(() => shuffle(STATUS_LINES));
  const [statusIndex, setStatusIndex] = useState(0);
  const [longWait, setLongWait] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const noteId = useRef(0);

  useEffect(() => {
    const id = setInterval(
      () => setStatusIndex((i) => (i + 1) % statusOrder.length),
      STATUS_INTERVAL_MS,
    );
    return () => clearInterval(id);
  }, [statusOrder.length]);

  useEffect(() => {
    const id = setTimeout(() => setLongWait(true), LONG_WAIT_MS);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (reduce) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (!active) return;
      setNotes((prev) =>
        prev.length >= MAX_NOTES
          ? prev
          : [...prev, makeNote((noteId.current += 1))],
      );
      timer = setTimeout(tick, rand(340, 620));
    };
    timer = setTimeout(tick, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [reduce]);

  const removeNote = (id: number) =>
    setNotes((prev) => prev.filter((n) => n.id !== id));

  const label = truncateName(eventName);
  const statusText = longWait ? LONG_WAIT_LINE : statusOrder[statusIndex];

  return (
    <section
      className={cn(SHELL, className)}
      role="status"
      aria-live="polite"
      aria-label="Generating your playlist"
    >
      <h2 className="font-display text-2xl font-bold text-foreground">
        Building your playlist
      </h2>

      <div className="relative mx-auto mt-6 h-60 w-60">
        {/* Emerald halo */}
        <div
          className="absolute inset-6 rounded-full bg-primary/20 blur-3xl"
          aria-hidden="true"
        />

        {/* Spinning disc */}
        <motion.div
          className="absolute inset-0"
          style={{ transformOrigin: "center" }}
          animate={reduce ? undefined : { rotate: 360 }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
          aria-hidden="true"
        >
          <svg viewBox="0 0 240 240" className="h-full w-full">
            <defs>
              <radialGradient id="jamon-disc" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="hsl(220 20% 15%)" />
                <stop offset="100%" stopColor="hsl(220 22% 5%)" />
              </radialGradient>
              <linearGradient id="jamon-glint" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity="0" />
                <stop
                  offset="50%"
                  stopColor="hsl(var(--accent))"
                  stopOpacity="0.9"
                />
                <stop
                  offset="100%"
                  stopColor="hsl(var(--accent))"
                  stopOpacity="0"
                />
              </linearGradient>
              <filter id="jamon-soft" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="2.5" />
              </filter>
            </defs>

            {/* Outer emerald glow ring */}
            <circle
              cx="120"
              cy="120"
              r="92"
              fill="none"
              stroke="hsl(var(--primary))"
              strokeOpacity="0.5"
              strokeWidth="6"
              filter="url(#jamon-soft)"
            />
            {/* Disc body + rim */}
            <circle
              cx="120"
              cy="120"
              r="92"
              fill="url(#jamon-disc)"
              stroke="hsl(var(--primary))"
              strokeWidth="2"
            />
            {/* Grooves */}
            {GROOVE_RADII.map((r) => (
              <circle
                key={r}
                cx="120"
                cy="120"
                r={r}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeOpacity="0.14"
                strokeWidth="1"
              />
            ))}
            {/* Glint travelling with the grooves */}
            <path
              d="M120 32 A88 88 0 0 1 202 78"
              fill="none"
              stroke="url(#jamon-glint)"
              strokeWidth="7"
              strokeLinecap="round"
              opacity="0.75"
              filter="url(#jamon-soft)"
            />
          </svg>
        </motion.div>

        {/* Static label + tonearm */}
        <svg
          viewBox="0 0 240 240"
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          <defs>
            <radialGradient id="jamon-label" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="hsl(var(--accent))" />
              <stop offset="100%" stopColor="hsl(var(--primary))" />
            </radialGradient>
          </defs>

          <circle cx="120" cy="120" r="34" fill="url(#jamon-label)" />
          <circle
            cx="120"
            cy="120"
            r="34"
            fill="none"
            stroke="hsl(var(--background))"
            strokeOpacity="0.25"
            strokeWidth="1"
          />
          {/* Spindle hole */}
          <circle cx="120" cy="120" r="3" fill="hsl(var(--background))" />
          <text
            x="120"
            y="106"
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="8.5"
            fontWeight="600"
            fontFamily="var(--font-display)"
            fill="hsl(var(--primary-foreground))"
          >
            {label}
          </text>

          {/* Tonearm — rests on the disc's upper-right, never crossing the spindle */}
          <motion.g
            initial={reduce ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }}
          >
            <line
              x1="214"
              y1="46"
              x2="156"
              y2="78"
              stroke="hsl(var(--foreground))"
              strokeOpacity="0.5"
              strokeWidth="6"
              strokeLinecap="round"
            />
            <circle
              cx="214"
              cy="46"
              r="10"
              fill="hsl(var(--muted))"
              stroke="hsl(var(--foreground))"
              strokeOpacity="0.4"
              strokeWidth="2"
            />
            <rect
              x="146"
              y="72"
              width="20"
              height="12"
              rx="2"
              transform="rotate(151 156 78)"
              fill="hsl(var(--foreground))"
              fillOpacity="0.55"
            />
            <circle cx="156" cy="78" r="3" fill="hsl(var(--primary))" />
          </motion.g>
        </svg>

        {/* Musical notes */}
        <div
          className="absolute inset-0 flex items-center justify-center overflow-visible"
          aria-hidden="true"
        >
          {notes.map((n) => {
            const { Glyph } = n;
            return (
              <motion.span
                key={n.id}
                className="absolute"
                style={{
                  color: n.color,
                  filter: "drop-shadow(0 0 5px currentColor)",
                }}
                initial={{
                  x: n.originX,
                  y: n.originY,
                  opacity: 0,
                  scale: 0.4,
                }}
                animate={{
                  x: n.originX + n.driftX,
                  y: n.originY + n.driftY,
                  opacity: [0, 1, 1, 0],
                  scale: [0.4, n.scale, n.scale, n.scale * 0.9],
                  rotate: n.rotate,
                }}
                transition={{
                  duration: n.duration,
                  ease: "easeOut",
                  opacity: { times: [0, 0.12, 0.72, 1] },
                }}
                onAnimationComplete={() => removeNote(n.id)}
              >
                <Glyph className="h-5 w-5" />
              </motion.span>
            );
          })}
        </div>
      </div>

      <div className="mt-6 flex min-h-[2.5rem] items-center">
        <AnimatePresence mode="wait">
          <motion.p
            key={longWait ? "long" : statusIndex}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.4 }}
            className="max-w-xs text-sm text-muted-foreground"
          >
            {statusText}
          </motion.p>
        </AnimatePresence>
      </div>

      <p className="mt-3 max-w-xs text-xs text-muted-foreground/70">
        This usually takes up to a minute.
      </p>
    </section>
  );
};

export default GeneratingPlaylistCard;
