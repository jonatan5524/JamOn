import { motion } from "framer-motion";
import { Music, AlertCircle } from "lucide-react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import ParticleBackground from "@/components/ParticleBackground";
import GlassCard from "@/components/GlassCard";
import { useSpotifyAuth } from "@/hooks/use-spotify-auth";

const Login = () => {
  const navigate = useNavigate();
  const { startSpotifyLogin, isLoading, error, isAuthenticated } =
    useSpotifyAuth();

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated()) {
      navigate("/", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSpotifyLogin = () => {
    startSpotifyLogin();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/20 relative overflow-hidden">
      <ParticleBackground />

      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex items-center gap-3 mb-8"
        >
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <Music className="w-7 h-7 text-primary-foreground" />
          </div>
          <span className="font-display text-3xl font-bold">JamOn</span>
        </motion.div>

        {/* Login Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="w-full max-w-md"
        >
          <GlassCard className="p-8">
            <div className="text-center mb-8">
              <h1 className="font-display text-2xl font-bold mb-2">
                Welcome to JamOn
              </h1>
              <p className="text-muted-foreground">
                Sign in to create and join collaborative playlists
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 p-4 rounded-lg bg-destructive/10 border border-destructive/50 flex items-start gap-3"
              >
                <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-destructive">
                    Login Error
                  </p>
                  <p className="text-sm text-destructive/80">{error}</p>
                </div>
              </motion.div>
            )}

            <Button
              variant="glow"
              size="xl"
              className="w-full bg-[#1DB954] hover:bg-[#1ed760] text-white border-none disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleSpotifyLogin}
              disabled={isLoading}
            >
              <svg
                className="w-6 h-6 mr-3"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
              </svg>
              {isLoading
                ? "Redirecting to Spotify..."
                : "Continue with Spotify"}
            </Button>

            <p className="text-center text-sm text-muted-foreground mt-6">
              By signing in, you agree to let JamOn access your Spotify account
              to create collaborative playlists.
            </p>
          </GlassCard>
        </motion.div>

        {/* Footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="text-muted-foreground text-sm mt-8"
        >
          Create the perfect vibe together
        </motion.p>
      </div>
    </div>
  );
};

export default Login;
