import { motion } from "framer-motion";
import { Music, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSpotifyAuth } from "@/hooks/use-spotify-auth";
import ParticleBackground from "@/components/ParticleBackground";
import GlassCard from "@/components/GlassCard";

const Home = () => {
  const { logout, getAccessToken } = useSpotifyAuth();
  const token = getAccessToken();

  if (!token) {
    // If no token, redirect to login
    window.location.href = "/login";
    return null;
  }

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/20 relative overflow-hidden">
      <ParticleBackground />

      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="border-b border-white/10 backdrop-blur-md bg-background/30"
        >
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <Music className="w-6 h-6 text-primary-foreground" />
              </div>
              <span className="font-display text-2xl font-bold">JamOn</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </Button>
          </div>
        </motion.header>

        {/* Main Content */}
        <div className="flex-1 flex items-center justify-center px-4 py-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="w-full max-w-2xl"
          >
            <GlassCard className="p-12 text-center">
              <div className="mb-8">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center mx-auto mb-6">
                  <Music className="w-10 h-10 text-primary-foreground" />
                </div>
                <h1 className="font-display text-3xl font-bold mb-2">
                  Welcome to JamOn!
                </h1>
                <p className="text-muted-foreground text-lg">
                  You're successfully authenticated with Spotify
                </p>
              </div>

              <div className="bg-background/50 rounded-lg p-6 mb-8 text-left">
                <h2 className="font-semibold mb-4 text-primary">
                  What's Next?
                </h2>
                <ul className="space-y-3 text-sm text-muted-foreground">
                  <li className="flex items-start gap-3">
                    <span className="text-primary mt-1">•</span>
                    <span>Create collaborative playlists with friends</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-primary mt-1">•</span>
                    <span>Vote on tracks to add to the playlist</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-primary mt-1">•</span>
                    <span>Discover new music suggestions</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-primary mt-1">•</span>
                    <span>Share the perfect vibe with your group</span>
                  </li>
                </ul>
              </div>

              <div className="flex gap-4 justify-center">
                <Button
                  variant="glow"
                  size="lg"
                  className="bg-[#1DB954] hover:bg-[#1ed760] text-white border-none"
                >
                  Create Playlist
                </Button>
                <Button variant="outline" size="lg">
                  Browse Playlists
                </Button>
              </div>
            </GlassCard>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default Home;
