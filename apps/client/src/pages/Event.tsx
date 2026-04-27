import { useParams } from "react-router-dom";
import EventCodeBadge, {
  EventCodeBadgeSkeleton,
} from "@/components/event-detail/EventCodeBadge";
import GeneratePlaylistCard from "@/components/event-detail/GeneratePlaylistCard";
import InviteGuestsCard from "@/components/event-detail/InviteGuestsCard";
import JamOnMixCard from "@/components/event-detail/JamOnMixCard";
import ParticipantsCard from "@/components/event-detail/ParticipantsCard";
import TasteContributionsCard from "@/components/event-detail/TasteContributionsCard";
import ParticleBackground from "@/components/layout/ParticleBackground";
import TopNav from "@/components/layout/TopNav";
import { useEvent, useGenerateEventPlaylist } from "@/hooks/use-event";

const Event = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const { data: event, isLoading, isError } = useEvent(eventId);
  const generate = useGenerateEventPlaylist(eventId);

  const hasMix = Boolean(event?.mix);

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-background via-background to-primary/20">
      <ParticleBackground />

      <div className="relative z-10 flex min-h-screen flex-col">
        <TopNav
          showActions={false}
          rightSlot={
            isLoading || !event ? (
              <EventCodeBadgeSkeleton />
            ) : (
              <EventCodeBadge code={event.code} />
            )
          }
        />

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
          {isError ? (
            <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">
              Failed to load event.
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
              <div className="flex flex-col gap-5">
                <InviteGuestsCard
                  inviteUrl={event?.inviteUrl ?? ""}
                  isLoading={isLoading}
                />
                <ParticipantsCard
                  participants={event?.participants ?? []}
                  isLoading={isLoading}
                />
              </div>

              <div className="flex flex-col gap-5">
                {hasMix ? (
                  <>
                    <JamOnMixCard
                      mix={event?.mix ?? null}
                      participants={event?.participants ?? []}
                      isLoading={isLoading}
                    />
                    <TasteContributionsCard
                      contributions={event?.contributions ?? []}
                      isLoading={isLoading}
                    />
                  </>
                ) : (
                  <GeneratePlaylistCard
                    participantCount={event?.participants.length ?? 0}
                    isLoading={isLoading}
                    isGenerating={generate.isPending}
                    onGenerate={() => generate.mutate()}
                  />
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default Event;
