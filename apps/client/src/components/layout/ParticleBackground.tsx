import { useEffect, useState } from "react";
import { motion } from "framer-motion";

interface ParticleSeed {
  x: number;
  y: number;
  yTo: number;
  duration: number;
}

const PARTICLE_COUNT = 50;

const generateParticles = (w: number, h: number): ParticleSeed[] =>
  Array.from({ length: PARTICLE_COUNT }).map(() => ({
    x: Math.random() * w,
    y: Math.random() * h,
    yTo: Math.random() * h,
    duration: Math.random() * 10 + 10,
  }));

const ParticleBackground = () => {
  const [particles, setParticles] = useState<ParticleSeed[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setParticles(generateParticles(window.innerWidth, window.innerHeight));
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      {particles.map((p, i) => (
        <motion.div
          key={i}
          className="absolute h-1 w-1 rounded-full bg-primary/20"
          initial={{ x: p.x, y: p.y }}
          animate={{ y: [p.y, p.yTo], opacity: [0.2, 0.5, 0.2] }}
          transition={{
            duration: p.duration,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      ))}

      <div className="animate-pulse-slow absolute -left-32 top-1/4 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
      <div
        className="animate-pulse-slow absolute -right-32 bottom-1/4 h-96 w-96 rounded-full bg-accent/10 blur-3xl"
        style={{ animationDelay: "2s" }}
      />
    </div>
  );
};

export default ParticleBackground;
