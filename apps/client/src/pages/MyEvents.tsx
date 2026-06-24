import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useEventList } from "@/hooks/use-event";
import ParticleBackground from "@/components/layout/ParticleBackground";
import TopNav from "@/components/layout/TopNav";
import EventCard from "@/components/events/EventCard";
import EventCardSkeleton from "@/components/events/EventCardSkeleton";
import EmptyEvents from "@/components/events/EmptyEvents";
import JoinEventDialog from "@/components/events/JoinEventDialog";
import CreateEventDialog from "@/components/events/CreateEventDialog";
import ErrorState from "@/components/ui/error-state";
import type { EventSummary } from "@/types/event";

const MyEvents = () => {
  const navigate = useNavigate();
  const {
    data: events,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useEventList();
  const [joinOpen, setJoinOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const handleNewEvent = () => setCreateOpen(true);
  const handleJoinEvent = () => setJoinOpen(true);
  const handleEventClick = (event: EventSummary) => {
    navigate(`/events/${event.id}`);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-background via-background to-primary/20">
      <ParticleBackground />

      <div className="relative z-10 flex min-h-screen flex-col">
        <TopNav
          showBack={false}
          onNewEvent={handleNewEvent}
          onJoinEvent={handleJoinEvent}
        />

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8"
          >
            <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
              Your Events
            </h1>
            <p className="mt-2 text-muted-foreground">
              Manage and view all your music events
            </p>
          </motion.div>

          {isError ? (
            <ErrorState
              error={error}
              title="Couldn't load your events"
              onRetry={() => refetch()}
              isRetrying={isFetching}
            />
          ) : isLoading || !events ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <EventCardSkeleton key={i} />
              ))}
            </div>
          ) : events.length === 0 ? (
            <EmptyEvents
              onNewEvent={handleNewEvent}
              onJoinEvent={handleJoinEvent}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {events.map((event, index) => (
                <EventCard
                  key={event.id}
                  event={event}
                  index={index}
                  onClick={handleEventClick}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      <JoinEventDialog open={joinOpen} onClose={() => setJoinOpen(false)} />
      <CreateEventDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </div>
  );
};

export default MyEvents;
