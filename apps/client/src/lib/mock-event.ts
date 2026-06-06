import type { EventDetail, EventSummary } from "@/types/event";

export const MOCK_EVENT_SUMMARIES: EventSummary[] = [
  {
    id: "1",
    code: "ABC123",
    name: "Friday Night Vibes",
    description: "A chill party with friends to kick off the weekend",
    participantCount: 8,
  },
  {
    id: "2",
    code: "ZFXUCJ",
    name: "Road Trip Playlist",
    description: "Epic tunes for our cross-country adventure",
    participantCount: 4,
  },
  {
    id: "3",
    code: "ST7466",
    name: "Study Session",
    description: "Lo-fi beats and focus music for productive studying",
    participantCount: 3,
  },
  {
    id: "4",
    code: "EMPTY1",
    name: "New Year's Eve",
    description: "Just created — waiting for friends to join",
    participantCount: 0,
  },
];

const PARTICIPANTS = [
  { id: "p1", name: "Alex", initial: "A", colorHex: "#10b981" },
  { id: "p2", name: "Jordan", initial: "J", colorHex: "#a855f7" },
  { id: "p3", name: "Sam", initial: "S", colorHex: "#ef4444" },
  { id: "p4", name: "Taylor", initial: "T", colorHex: "#0ea5e9" },
] as const;

const fullDetail: EventDetail = {
  id: "2",
  code: "ZFXUCJ",
  name: "Road Trip Playlist",
  description: "Epic tunes for our cross-country adventure",
  participantCount: 4,
  inviteUrl: "https://jamon.app/join/ZFXUCJ",
  participants: PARTICIPANTS.map((p) => ({
    ...p,
    source: "spotify" as const,
    activity: 0.7,
  })),
  mix: {
    id: "mix-1",
    trackCount: 5,
    durationMin: 18,
    spotifyUrl: "https://open.spotify.com/playlist/mock",
    tracks: [
      { id: "t1", position: 1, title: "Blinding Lights", artist: "The Weeknd", contributorIds: ["p1", "p2"] },
      { id: "t2", position: 2, title: "Levitating", artist: "Dua Lipa", contributorIds: ["p2", "p4"] },
      { id: "t3", position: 3, title: "Good 4 U", artist: "Olivia Rodrigo", contributorIds: ["p1", "p3"] },
      { id: "t4", position: 4, title: "Heat Waves", artist: "Glass Animals", contributorIds: ["p2", "p3"] },
      { id: "t5", position: 5, title: "Stay", artist: "The Kid LAROI & Justin Bieber", contributorIds: ["p1", "p3", "p4"] },
    ],
  },
  contributions: [
    { participantId: "p1", participantName: "Alex", percent: 28, colorHex: "#10b981" },
    { participantId: "p2", participantName: "Jordan", percent: 24, colorHex: "#a855f7" },
    { participantId: "p3", participantName: "Sam", percent: 22, colorHex: "#ef4444" },
    { participantId: "p4", participantName: "Taylor", percent: 26, colorHex: "#0ea5e9" },
  ],
  viewerRole: "creator",
};

const emptyDetail: EventDetail = {
  id: "4",
  code: "EMPTY1",
  name: "New Year's Eve",
  description: "Just created — waiting for friends to join",
  participantCount: 0,
  inviteUrl: "https://jamon.app/join/EMPTY1",
  participants: [],
  mix: null,
  contributions: [],
  viewerRole: "creator",
};

export const MOCK_EVENT_DETAIL = fullDetail;

export const MOCK_EVENT_DETAILS: Record<string, EventDetail> = {
  "1": { ...fullDetail, id: "1", code: "ABC123", name: "Friday Night Vibes" },
  "2": fullDetail,
  "3": { ...fullDetail, id: "3", code: "ST7466", name: "Study Session" },
  "4": emptyDetail,
};
