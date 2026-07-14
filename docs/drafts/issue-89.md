# 7. Appendix A

## 7.1 Prerequisites

The following software and credentials must be present before proceeding with local setup:

- Python 3.10 or later
- Node.js 18 or later
- A Spotify Developer application with the OAuth scopes `playlist-modify-public`, `playlist-modify-private`, `user-read-private`, and `user-top-read` granted
- A Google Gemini API key

A Genius API token is optional but recommended, as it enables lyrics enrichment during the tagging pipeline.

## 7.2 Data Engine Setup

Navigate to the data-engine directory, create a Python virtual environment, and install the required packages:

```
cd apps/data-engine
python3 -m venv app/.venv
source app/.venv/bin/activate
pip install -r requirements.txt
```

Create the file `apps/data-engine/app/.env` with the following minimal configuration:

```
GEMINI_API_KEY=your_gemini_key
GENIUS_ACCESS_TOKEN=your_genius_token
LLM_PROVIDER=gemini
VECTOR_DB_PROVIDER=chroma
PROVIDER_FAILOVER_ENABLED=false
```

Start the service:

```
cd apps/data-engine
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

The service is ready when `Providers ready` appears in the log output. The interactive API documentation is available at `http://localhost:8000/docs`.

## 7.3 Orchestrator Setup

Navigate to the orchestrator directory and install dependencies:

```
cd apps/orchestrator
npm install
```

Create `apps/orchestrator/.env`:

```
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SPOTIFY_REDIRECT_URI=http://localhost:5173/callback
DATA_ENGINE_URL=http://localhost:8000
```

Start the service in development mode:

```
npm run start:dev
```

The orchestrator listens on `http://localhost:3000`.

## 7.4 Client Setup

Navigate to the client directory and install dependencies:

```
cd apps/client
npm install
```

Create `apps/client/.env`:

```
VITE_API_URL=http://localhost:3000
```

Start the development server:

```
npm run dev
```

The client is accessible at `http://localhost:5173`. Navigating to this address and logging in with Spotify completes the end-to-end setup.

## 7.5 Obtaining a Spotify Access Token

For direct API testing without the client interface, a token may be obtained through the Spotify authorization code flow. Paste the following URL into a browser, substituting `CLIENT_ID` with the application credential:

```
https://accounts.spotify.com/authorize?client_id=CLIENT_ID&response_type=code&redirect_uri=https://google.com&scope=playlist-modify-public%20playlist-modify-private%20user-read-private%20user-top-read&show_dialog=true
```

After authorization, copy the `code` parameter from the redirect URL query string. Exchange it for an access token:

```
curl -X POST https://accounts.spotify.com/api/token \
  -H "Authorization: Basic BASE64_CLIENT_CREDS" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&code=THE_CODE&redirect_uri=https://google.com"
```

`BASE64_CLIENT_CREDS` is the Base64 encoding of `client_id:client_secret`.

## 7.6 Provider Mode Reference

The data engine supports three LLM provider configurations, selected via the `LLM_PROVIDER` environment variable. The following table summarizes the model assigned to each task per mode.


| Mode               | Embedding          | Tagging       | Generation     | HyDE          |
| ------------------ | ------------------ | ------------- | -------------- | ------------- |
| `gemini` (default) | Gemini 3072-dim    | Gemini Flash  | Gemini Flash   | Gemini Flash  |
| `college`          | all-minilm 384-dim | gemma3:12b    | gemma3:12b     | gemma3:12b    |
| `nim`              | Gemini 3072-dim    | NIM Llama-70b | College gemma3 | NIM Llama-70b |


The embedding provider must not be changed after songs have been indexed. Gemini embeddings use 3072 dimensions and College embeddings use 384 dimensions; switching providers after indexing requires a full re-index.

To run the optional evaluation harness and calibrate retrieval parameters:

```
python -m eval.eval_loop
```

