import { Component, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";
import Logo from "@/components/brand/Logo";
import ParticleBackground from "@/components/layout/ParticleBackground";
import GlassCard from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";

const ErrorFallback = ({
  error,
  onReset,
}: {
  error: Error;
  onReset: () => void;
}) => {
  const navigate = useNavigate();

  const goHome = () => {
    navigate("/");
    onReset();
  };

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
        transition={{ duration: 0.5, delay: 0.15 }}
        className="w-full max-w-md"
      >
        <GlassCard hover={false} className="p-8 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/15 text-destructive">
            <AlertTriangle className="h-7 w-7" />
          </div>

          <h1 className="font-display text-2xl font-bold text-foreground">
            Something went wrong
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            An unexpected error broke this view. You can try again, or reload
            the app if it keeps happening.
          </p>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button variant="accent" size="sm" onClick={goHome} className="gap-2">
              <Home className="h-4 w-4" />
              Back home
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.reload()}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Reload page
            </Button>
          </div>

          {import.meta.env.DEV && (
            <details className="mt-6 text-left">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                Error details (dev only)
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-background/60 p-3 text-[11px] leading-relaxed text-destructive/90">
                {error.message}
                {error.stack ? `\n\n${error.stack}` : ""}
              </pre>
            </details>
          )}
        </GlassCard>
      </motion.div>
    </div>
  </div>
  );
};

interface ErrorBoundaryProps {
  children: ReactNode;
  resetKey?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("ErrorBoundary caught an error:", error, info.componentStack);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.reset();
    }
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return <ErrorFallback error={this.state.error} onReset={this.reset} />;
    }
    return this.props.children;
  }
}

const AppErrorBoundary = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  return <ErrorBoundary resetKey={location.pathname}>{children}</ErrorBoundary>;
};

export default AppErrorBoundary;
export { ErrorBoundary };
