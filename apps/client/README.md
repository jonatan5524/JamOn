# JamOn Client

React + TypeScript frontend for JamOn. Lets users log in with Spotify, create events, and generate AI-curated playlists tailored to the vibe of each event.

## Quick Start

### Prerequisites

- Node.js 18+
- A running [orchestrator](../orchestrator/README.md) on `http://localhost:3000`

### Setup & Run

```bash
cd apps/client
npm install
```

Create `apps/client/.env`:

```env
VITE_API_URL=http://localhost:3000
```

```bash
npm run dev
```

App runs on `http://localhost:5173`.

### Other Commands

```bash
npm run build     # production build → dist/
npm run preview   # preview production build locally
npm run lint      # ESLint check
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | Yes | Orchestrator base URL |
| `VITE_BYPASS_AUTH` | No | Set to `true` to skip Spotify login in development |
| `VITE_USE_MOCKS` | No | Set to `true` to use mock API responses |

## Pages

| Route | Page | Description |
|-------|------|-------------|
| `/login` | Login | Spotify OAuth entry point |
| `/` | Home | Overview of user's events |
| `/events` | Events | Browse and create events |
| `/events/:id` | Event Detail | View event + trigger playlist generation |
| `/my-events` | My Events | Events created by the logged-in user |
| `/join` | Join By Code | Join a shared event via invite code |

### Core Flow

```
/login  →  Spotify OAuth  →  /events
                                │
                         Create Event
                                │
                         /events/:id
                                │
                      "Generate Playlist"
                                │
                 POST /playlists/generate (orchestrator)
                                │
                    Spotify playlist URL returned
```

## Tech Stack

| Library | Purpose |
|---------|---------|
| React 18 + TypeScript | UI framework |
| Vite | Dev server + bundler |
| React Router v6 | Client-side routing |
| TanStack Query v5 | Server state, caching, async data fetching |
| Axios | HTTP client |
| Radix UI | Accessible headless components (Tooltip, Toast, Slot) |
| Tailwind CSS | Utility-first styling |
| Framer Motion | Animations |
| Lucide React | Icon set |
| Sonner | Toast notifications |
| qrcode.react | QR code for event sharing |

## Project Structure

```
src/
├── main.tsx               App entry point
├── App.tsx                Router setup + providers
├── index.css              Global styles (Tailwind base)
├── pages/
│   ├── Login.tsx
│   ├── Home.tsx
│   ├── MyEvents.tsx
│   ├── JoinByCode.tsx
│   ├── Event.tsx
│   ├── events/            Event list + creation
│   └── event-detail/      Event detail + playlist trigger
├── components/
│   ├── ui/                Low-level UI primitives (Button, Card, etc.)
│   ├── brand/             JamOn logo + branding
│   └── layout/            Page layout wrappers
├── hooks/                 TanStack Query hooks (useEvents, usePlaylist, etc.)
├── lib/                   Axios instance + shared utilities
└── types/                 Shared TypeScript types
```
