import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { eventKeys, useGenerateEventPlaylist } from "./use-event";

/**
 * Owns the "generate playlist" view state so the loader → result swap is
 * deliberate (rather than snapping the moment React Query refetches), and so a
 * very fast response still shows the loader long enough to register.
 */

export type GenerationPhase = "idle" | "generating" | "done";

/** Keep the loader on screen at least this long, even if the request is faster. */
const MIN_VISIBLE_MS = 2800;

interface StartOptions {
  onSuccess?: () => void;
  onError?: (err: unknown) => void;
}

export const useGenerationPhase = (eventId: string | undefined) => {
  const qc = useQueryClient();
  const generate = useGenerateEventPlaylist(eventId);
  const [phase, setPhase] = useState<GenerationPhase>("idle");
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const settle = useCallback((next: GenerationPhase, run: () => void) => {
    const remaining = Math.max(0, MIN_VISIBLE_MS - (Date.now() - startedAt.current));
    timer.current = setTimeout(() => {
      setPhase(next);
      run();
    }, remaining);
  }, []);

  const start = useCallback(
    (opts?: StartOptions) => {
      if (phase === "generating") return;
      startedAt.current = Date.now();
      setPhase("generating");
      generate.mutate(undefined, {
        onSuccess: async () => {
          // Make sure the fresh mix is in the cache before we reveal it.
          await qc.refetchQueries({ queryKey: eventKeys.detail(eventId) });
          settle("done", () => opts?.onSuccess?.());
        },
        onError: (err) => {
          settle("idle", () => opts?.onError?.(err));
        },
      });
    },
    [phase, generate, qc, eventId, settle],
  );

  return { phase, start };
};
