import { motion } from "framer-motion";
import { Music, Users, Sparkles, ArrowRight, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import ParticleBackground from "@/components/ParticleBackground";
import GlassCard from "@/components/GlassCard";
import MusicWave from "@/components/MusicWave";

const Index = () => {
  const navigate = useNavigate();

  const features = [
    {
      icon: Music,
      title: "Event Vibe",
      description: "Describe your event's atmosphere and let AI understand the perfect mood",
    },
    {
      icon: Users,
      title: "Group Taste",
      description: "Everyone's music preferences blend together seamlessly",
    },
    {
      icon: Sparkles,
      title: "AI Magic",
      description: "Smart algorithms find songs at the intersection of all tastes",
    },
  ];

  return (
    <div className="min-h-screen relative overflow-hidden">
      <ParticleBackground />
      
      <div className="relative z-10 container mx-auto px-4 py-8">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-16"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <Music className="w-5 h-5 text-primary" />
            </div>
            <span className="font-display text-xl font-bold">JamOn</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => navigate("/events")}>
              Your Events
            </Button>
            <Button variant="glass" onClick={() => navigate("/join")}>
              <QrCode className="w-4 h-4" />
              Join Event
            </Button>
          </div>
        </motion.header>

        {/* Hero */}
        <main className="max-w-4xl mx-auto text-center pt-12 pb-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-6"
          >
            <MusicWave className="justify-center mb-8" barCount={7} />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="font-display text-5xl md:text-7xl font-bold mb-6 leading-tight"
          >
            Create the{" "}
            <span className="gradient-text">Perfect Playlist</span>
            <br />
            for Every Moment
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto"
          >
            Combine your group's music taste with AI to generate playlists 
            that everyone will love. Perfect for parties, road trips, or any gathering.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <Button size="xl" variant="glow" onClick={() => navigate("/create")}>
              Create Event
              <ArrowRight className="w-5 h-5" />
            </Button>
            <Button size="xl" variant="glass" onClick={() => navigate("/join")}>
              Join with Code
            </Button>
          </motion.div>
        </main>

        {/* Features */}
        <section className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="grid md:grid-cols-3 gap-6"
          >
            {features.map((feature, i) => (
              <GlassCard key={feature.title}>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7 + i * 0.1 }}
                >
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                    <feature.icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-display text-xl font-semibold mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </motion.div>
              </GlassCard>
            ))}
          </motion.div>
        </section>

        {/* How it works */}
        <section className="max-w-4xl mx-auto mt-24 mb-16">
          <motion.h2
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="font-display text-3xl md:text-4xl font-bold text-center mb-12"
          >
            How It <span className="gradient-text-accent">Works</span>
          </motion.h2>

          <div className="grid md:grid-cols-4 gap-4">
            {[
              { step: "01", title: "Create", desc: "Set up your event vibe" },
              { step: "02", title: "Share", desc: "Invite via QR code" },
              { step: "03", title: "Mix", desc: "AI analyzes tastes" },
              { step: "04", title: "Play", desc: "Enjoy your playlist" },
            ].map((item, i) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="text-center"
              >
                <div className="text-4xl font-display font-bold text-primary/30 mb-2">
                  {item.step}
                </div>
                <h4 className="font-display font-semibold text-lg mb-1">{item.title}</h4>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default Index;
