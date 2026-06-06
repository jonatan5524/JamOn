import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  createEvent,
  generateEventPlaylist,
  getEvent,
  joinEvent,
  myEventsList,
} from "@/lib/api/index";
import type { CreateEventRequest, PlaylistResponse } from "@/types/api";
import type {
  EventDetail,
  EventSummary,
  JamOnMix,
  Participant,
  TasteContribution,
} from "@/types/event";

export const eventKeys = {
  all: ["events"] as const,
  list: () => [...eventKeys.all, "list"] as const,
  detail: (id: string | undefined) => [...eventKeys.all, "detail", id] as const,
};

export const useEventList = () =>
  useQuery<EventSummary[]>({
    queryKey: eventKeys.list(),
    queryFn: myEventsList,
    staleTime: 30_000,
  });

export const useEvent = (eventId: string | undefined) =>
  useQuery<EventDetail>({
    queryKey: eventKeys.detail(eventId),
    enabled: Boolean(eventId),
    queryFn: () => getEvent(eventId as string),
    staleTime: 30_000,
    retry: (count, err) =>
      !(err instanceof ApiError && (err.status === 404 || err.status === 403)) &&
      count < 3,
  });

export const useEventMix = (eventId: string | undefined) =>
  useQuery<EventDetail, Error, JamOnMix | null>({
    queryKey: eventKeys.detail(eventId),
    enabled: Boolean(eventId),
    queryFn: () => getEvent(eventId as string),
    staleTime: 30_000,
    select: (data) => data.mix ?? null,
  });

export const useEventParticipants = (eventId: string | undefined) =>
  useQuery<EventDetail, Error, Participant[]>({
    queryKey: eventKeys.detail(eventId),
    enabled: Boolean(eventId),
    queryFn: () => getEvent(eventId as string),
    staleTime: 30_000,
    select: (data) => data.participants,
  });

export const useTasteContributions = (eventId: string | undefined) =>
  useQuery<EventDetail, Error, TasteContribution[]>({
    queryKey: eventKeys.detail(eventId),
    enabled: Boolean(eventId),
    queryFn: () => getEvent(eventId as string),
    staleTime: 30_000,
    select: (data) => data.contributions,
  });

export const useCreateEvent = () => {
  const qc = useQueryClient();
  return useMutation<EventSummary, Error, CreateEventRequest>({
    mutationFn: createEvent,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: eventKeys.list() });
    },
  });
};

export const useJoinEvent = (eventId: string | undefined) => {
  const qc = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: () => joinEvent(eventId as string),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: eventKeys.detail(eventId) });
      qc.invalidateQueries({ queryKey: eventKeys.list() });
    },
  });
};

export const useGenerateEventPlaylist = (eventId: string | undefined) => {
  const qc = useQueryClient();
  return useMutation<PlaylistResponse, Error, void>({
    mutationFn: () => generateEventPlaylist(eventId as string),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: eventKeys.detail(eventId) });
    },
  });
};
