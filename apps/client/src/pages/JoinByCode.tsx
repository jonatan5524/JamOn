import { useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { findEventByCode, joinEvent } from "@/lib/api/index";
import ParticleBackground from "@/components/layout/ParticleBackground";
import type { EventSummary } from "@/types/event";

const CODE_REGEX = /^[A-Z0-9]{6}$/;

const JoinByCode = () => {
  const navigate = useNavigate();
  const { code } = useParams<{ code: string }>();
  const fired = useRef(false);

  const mutation = useMutation<EventSummary, Error, string>({
    mutationFn: async (input) => {
      const event = await findEventByCode(input);
      await joinEvent(event.id);
      return event;
    },
    onSuccess: (event) => {
      toast.success(`Joined ${event.name}`);
      navigate(`/events/${event.id}`, { replace: true });
    },
    onError: () => {
      toast.error("Failed to join event");
      navigate("/", { replace: true });
    },
  });

  useEffect(() => {
    if (fired.current) return;
    const normalized = (code ?? "").toUpperCase();
    if (!CODE_REGEX.test(normalized)) {
      toast.error("Invalid event code");
      navigate("/", { replace: true });
      return;
    }
    fired.current = true;
    mutation.mutate(normalized);
  }, [code, navigate, mutation]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-background via-background to-primary/20">
      <ParticleBackground />
      <div className="relative z-10 flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Joining event…</p>
      </div>
    </div>
  );
};

export default JoinByCode;
