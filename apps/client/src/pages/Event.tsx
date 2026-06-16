import { useParams } from "react-router-dom";
import EventCodeBadge, {
  EventCodeBadgeSkeleton,
} from "@/components/event-detail/EventCodeBadge";
import EventAccessDenied from "@/components/event-detail/EventAccessDenied";
import EventNotFound from "@/components/event-detail/EventNotFound";
import GeneratePlaylistCard from "@/components/event-detail/GeneratePlaylistCard";
import GroupMatchCard from "@/components/event-detail/GroupMatchCard";
import InviteGuestsCard from "@/components/event-detail/InviteGuestsCard";
import JamOnMixCard from "@/components/event-detail/JamOnMixCard";
import ParticipantsCard from "@/components/event-detail/ParticipantsCard";
import TasteContributionsCard from "@/components/event-detail/TasteContributionsCard";
import ParticleBackground from "@/components/layout/ParticleBackground";
import TopNav from "@/components/layout/TopNav";
import ErrorState from "@/components/ui/error-state";
import { toast } from "sonner";
import { useEvent, useGenerateEventPlaylist } from "@/hooks/use-event";
import { ApiError } from "@/lib/api/index";

/** Pull a human message out of an axios/ApiError, else a generic fallback. */
const getGenerateErrorMessage = (err: unknown): string => {
  const data = (
    err as { response?: { data?: { message?: string; error?: string } } }
  )?.response?.data;
  if (data?.message) return data.message;
  if (data?.error) return data.error;
  if (err instanceof ApiError) return err.message;
  return "Failed to generate playlist";
};

const Event = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const { data: event, isLoading, isError, error, refetch, isFetching } =
    useEvent(eventId);
  const generate = useGenerateEventPlaylist(eventId);

  const isNotFound = error instanceof ApiError && error.status === 404;
  const isForbidden = error instanceof ApiError && error.status === 403;
  const hasMix = Boolean(event?.mix);

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-background via-background to-primary/20">
      <ParticleBackground />

      <div className="relative z-10 flex min-h-screen flex-col">
        <TopNav
          showActions={false}
          rightSlot={
            isNotFound || isForbidden ? null : isLoading || !event ? (
              <EventCodeBadgeSkeleton />
            ) : (
              <EventCodeBadge code={event.code} />
            )
          }
        />

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
          {isNotFound ? (
            <EventNotFound />
          ) : isForbidden ? (
            <EventAccessDenied />
          ) : isError ? (
            <ErrorState
              error={error}
              title="Couldn't load this event"
              onRetry={() => refetch()}
              isRetrying={isFetching}
            />
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
                    <GroupMatchCard
                      percent={event?.playlistMatchPercent}
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
                    isCreator={event?.viewerRole === "creator"}
                    isLoading={isLoading}
                    isGenerating={generate.isPending}
                    onGenerate={() =>
                      generate.mutate(undefined, {
                        onSuccess: () => toast.success("Playlist generated"),
                        onError: (err) =>
                          toast.error(getGenerateErrorMessage(err)),
                      })
                    }
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
