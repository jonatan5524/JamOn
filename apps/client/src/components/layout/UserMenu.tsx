import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LogOut, Settings } from "lucide-react";
import { useSpotifyAuth } from "@/hooks/use-spotify-auth";
import { cn } from "@/lib/utils";

interface MenuItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  destructive?: boolean;
}

const UserMenu = () => {
  const { logout } = useSpotifyAuth();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const items: MenuItem[] = [
    {
      label: "Log out",
      icon: LogOut,
      onClick: () => {
        setOpen(false);
        logout();
      },
      destructive: true,
    },
  ];

  return (
    <div
      ref={containerRef}
      className="fixed bottom-4 right-4 z-30 sm:bottom-6 sm:right-6"
    >
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.14 }}
            role="menu"
            className="absolute bottom-full right-0 mb-2 w-48 overflow-hidden rounded-lg border border-white/10 bg-card/95 p-1 shadow-2xl backdrop-blur-xl"
          >
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  onClick={item.onClick}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors",
                    item.destructive
                      ? "text-destructive hover:bg-destructive/10"
                      : "text-foreground hover:bg-white/5",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Settings"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-card/80 text-muted-foreground shadow-xl backdrop-blur-md transition-colors hover:border-accent/40 hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
          open && "border-accent/50 text-accent",
        )}
      >
        <Settings className={cn("h-5 w-5 transition-transform", open && "rotate-45")} />
      </button>
    </div>
  );
};

export default UserMenu;
