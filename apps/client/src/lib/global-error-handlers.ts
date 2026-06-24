import { toast } from "sonner";

const isIgnorable = (reason: unknown): boolean => {
  if (reason instanceof DOMException && reason.name === "AbortError") return true;
  if (
    typeof reason === "object" &&
    reason !== null &&
    "name" in reason &&
    (reason as { name?: string }).name === "CanceledError"
  ) {
    return true;
  }
  return false;
};

let lastShown = "";
let lastShownAt = 0;

const notify = (reason: unknown) => {
  if (isIgnorable(reason)) return;

  const message =
    reason instanceof Error ? reason.message : String(reason ?? "Unknown error");

  // Dedupe identical messages fired within a short window.
  const now = Date.now();
  if (message === lastShown && now - lastShownAt < 4000) return;
  lastShown = message;
  lastShownAt = now;

  console.error("Unhandled error:", reason);
  toast.error("Something went wrong", {
    description: "An unexpected error occurred. Please try again.",
  });
};

let registered = false;

export const registerGlobalErrorHandlers = (): void => {
  if (registered) return;
  registered = true;

  window.addEventListener("unhandledrejection", (event) => {
    notify(event.reason);
  });

  window.addEventListener("error", (event) => {
    notify(event.error ?? event.message);
  });
};
