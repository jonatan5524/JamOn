import { motion } from "framer-motion";
import { AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Logo from "@/components/brand/Logo";
import SpotifyMark from "@/components/brand/SpotifyMark";
import ParticleBackground from "@/components/layout/ParticleBackground";
import GlassCard from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { useSpotifyAuth } from "@/hooks/use-spotify-auth";

const Login = () => {
  const navigate = useNavigate();
  const { startSpotifyLogin, isLoading, error, isAuthenticated } =
    useSpotifyAuth();
  const [email, setEmail] = useState("");
  const [ineligible, setIneligible] = useState(false);
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleLogin = async () => {
    const result = await startSpotifyLogin(email);
    setIneligible(result === "ineligible");
  };

  const tryAnotherEmail = () => {
    setIneligible(false);
    setEmail("");
  };

  useEffect(() => {
    if (isAuthenticated()) {
      navigate("/", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-background via-background to-primary/20">
      <ParticleBackground />

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <Logo />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="w-full max-w-md"
        >
          <GlassCard hover={false} className="p-8">
            <div className="mb-8 text-center">
              <h1 className="font-display mb-2 text-2xl font-bold">
                Welcome to JamOn
              </h1>
              <p className="text-muted-foreground">
                Sign in to create and join collaborative playlists
              </p>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4"
              >
                <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-destructive" />
                <div>
                  <p className="text-sm font-medium text-destructive">
                    Login Error
                  </p>
                  <p className="text-sm text-destructive/80">{error}</p>
                </div>
              </motion.div>
            )}

            {ineligible ? (
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
                  <p className="text-sm font-medium text-amber-200">
                    This email isn't set up for testing yet
                  </p>
                  <p className="mt-1 text-sm text-amber-200/80">
                    JamOn is in Spotify test mode with a limited tester list. Ask
                    the team to add{" "}
                    <span className="font-medium">{email}</span> to the allowlist,
                    then try again.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={tryAnotherEmail}
                  className="w-full"
                >
                  Try a different email
                </Button>
              </div>
            ) : (
              <>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="Your Spotify account email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mb-4 w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none"
                />

                <Button
                  variant="glow"
                  size="xl"
                  onClick={handleLogin}
                  disabled={isLoading || !isValidEmail}
                  className="w-full border-none bg-[#1DB954] text-white hover:bg-[#1ed760] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <SpotifyMark className="mr-3 h-6 w-6" />
                  {isLoading
                    ? "Redirecting to Spotify..."
                    : "Continue with Spotify"}
                </Button>
              </>
            )}

            <p className="mt-6 text-center text-sm text-muted-foreground">
              By signing in, you agree to let JamOn access your Spotify account
              to create collaborative playlists.
            </p>
          </GlassCard>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-8 text-sm text-muted-foreground"
        >
          Create the perfect vibe together
        </motion.p>
      </div>
    </div>
  );
};

export default Login;
