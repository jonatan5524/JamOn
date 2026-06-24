import { motion } from "framer-motion";
import { AlertTriangle, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  error?: unknown;
  title?: string;
  description?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
  className?: string;
}

const ErrorState = ({
  error,
  title,
  description,
  onRetry,
  isRetrying,
  className,
}: ErrorStateProps) => {
  const friendly = getErrorMessage(error);
  const resolvedTitle = title ?? friendly.title;
  const resolvedDescription = description ?? friendly.description;
  const offline =
    typeof navigator !== "undefined" && navigator.onLine === false;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-destructive/30 bg-destructive/5 px-6 py-12 text-center",
        className,
      )}
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/15 text-destructive">
        {offline ? (
          <WifiOff className="h-6 w-6" />
        ) : (
          <AlertTriangle className="h-6 w-6" />
        )}
      </div>

      <h3 className="font-display text-lg font-semibold text-foreground">
        {resolvedTitle}
      </h3>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
        {resolvedDescription}
      </p>

      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          disabled={isRetrying}
          className="mt-5 gap-2"
        >
          <RefreshCw className={cn("h-4 w-4", isRetrying && "animate-spin")} />
          {isRetrying ? "Retrying…" : "Try again"}
        </Button>
      )}
    </motion.div>
  );
};

export default ErrorState;
