# Spotify OAuth2 Login Setup

This guide explains how to set up and use the Spotify OAuth2 authentication in JamOn.

## Overview

The authentication flow uses the OAuth2 Authorization Code Flow:

1. User clicks "Continue with Spotify" on the login page
2. Client redirects to the orchestrator's `/auth/spotify/authorize` endpoint
3. Orchestrator redirects to Spotify's authorization page
4. User grants permission and is redirected back to the orchestrator
5. Orchestrator exchanges the authorization code for an access token
6. Access token is passed back to the client and stored in localStorage
7. Client uses the token for subsequent API requests

## Setup Instructions

### 1. Register Your Application with Spotify

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Log in or create a Spotify account
3. Create a new app
4. Accept the terms and create the app
5. You'll receive:
   - **Client ID**
   - **Client Secret**

### 2. Configure Redirect URI

In your Spotify app settings on the Developer Dashboard:

1. Go to "Edit Settings"
2. Add Redirect URIs:
   - `http://localhost:3000/auth/spotify/callback` (for development)
   - Your production URL (e.g., `https://jamon.example.com/auth/spotify/callback`)

### 3. Set Environment Variables

#### Orchestrator (Backend)

Copy `.env.example` to `.env` in `apps/orchestrator/`:

```bash
cp apps/orchestrator/.env.example apps/orchestrator/.env
```

Edit `.env` and add your Spotify credentials:

```env
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REDIRECT_URI=http://localhost:3000/auth/spotify/callback
API_URL=http://localhost:3000
CLIENT_URL=http://localhost:5173
```

#### Client (Frontend)

Copy `.env.example` to `.env` in `apps/client/`:

```bash
cp apps/client/.env.example apps/client/.env
```

Edit `.env`:

```env
VITE_API_URL=http://localhost:3000
```

### 4. Required Spotify Scopes

The application requests the following Spotify permissions:

- `playlist-modify-public` - Create and modify public playlists
- `playlist-modify-private` - Create and modify private playlists
- `user-read-private` - Access user profile data
- `user-read-email` - Access user email
- `user-top-read` - Access user's top tracks

## How It Works

### Login Flow

1. User sees the login page with a "Continue with Spotify" button
2. Clicking the button calls `useSpotifyAuth().startSpotifyLogin()`
3. This makes a request to `/auth/spotify/authorize`
4. The backend returns a URL redirecting to Spotify's authorization page
5. User is redirected to Spotify and grants permission
6. Spotify redirects back to `/auth/spotify/callback` with an authorization code
7. The orchestrator exchanges the code for an access token
8. The access token is returned to the client via URL hash
9. The client stores the token and redirects to the home page

### Using the Access Token

The `useSpotifyAuth` hook provides methods to:

```typescript
const {
  startSpotifyLogin, // Initiate Spotify login
  getAccessToken, // Get current access token
  logout, // Clear stored token
  isAuthenticated, // Check if user is logged in
  isLoading, // Loading state during login
  error, // Any error that occurred
} = useSpotifyAuth();
```

### Making API Requests

In your components, include the access token in the Authorization header:

```typescript
const token = useSpotifyAuth().getAccessToken();

fetch('http://localhost:3000/playlists/generate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({...})
});
```

## Token Storage

- Access tokens are stored in `localStorage` under the key `jamon_spotify_token`
- Expiration time is stored under `jamon_token_expiry`
- Tokens are automatically cleared when expired
- Users are logged out when accessing with an expired token

## Development

To test locally:

1. Start the orchestrator: `cd apps/orchestrator && npm run start:dev`
2. Start the client: `cd apps/client && npm run dev`
3. Navigate to `http://localhost:5173`
4. Click "Continue with Spotify"
5. You should be redirected to Spotify
6. After granting permission, you'll be redirected back to the app

## Troubleshooting

### "Invalid redirect URI"

- Check that your SPOTIFY_REDIRECT_URI matches exactly what's configured in the Spotify Developer Dashboard
- Make sure you're using the correct protocol (http/https)

### "Invalid Client"

- Verify SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET are correct
- Check that they're loaded as environment variables

### Token not persisting

- Check that localStorage is enabled in your browser
- Check browser console for any errors during login
- Verify the token is being returned in the URL hash

### CORS errors

- Ensure CORS is enabled in the orchestrator (check main.ts)
- Verify CLIENT_URL is set correctly in orchestrator .env

## Security Considerations

1. **Never commit .env files** - They contain sensitive credentials
2. **Use HTTPS in production** - OAuth requires secure connections
3. **Token expiration** - Tokens expire in 1 hour; consider implementing refresh token logic for production
4. **Secure storage** - localStorage is suitable for short-lived tokens, but for production consider more secure alternatives
