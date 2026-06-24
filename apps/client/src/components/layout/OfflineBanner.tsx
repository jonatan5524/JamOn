import { AnimatePresence, motion } from "framer-motion";
import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/use-online-status";

const OfflineBanner = () => {
  const online = useOnlineStatus();

  return (
    <AnimatePresence>
      {!online && (
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.25 }}
          role="status"
          className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-destructive/90 px-4 py-2 text-center text-xs font-medium text-destructive-foreground backdrop-blur"
        >
          <WifiOff className="h-3.5 w-3.5" />
          You&apos;re offline — some features may not work until you reconnect.
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default OfflineBanner;
