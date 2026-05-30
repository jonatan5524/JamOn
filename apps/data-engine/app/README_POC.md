# JamOn Agentic RAG - Multi-User POC

This tool allows you to test the Agentic RAG playlist generation logic locally, without needing to run the full NestJS orchestrator or the frontend.

## Overview

The POC simulates an event with multiple users. It performs the following:
1.  **Interactive Input**: Asks for User A and User B's top songs.
2.  **Indexing**: Generates LLM-based audio features and fetches lyrics for all songs, then indexes them into a local ChromaDB instance.
3.  **Agentic Workflow**: Runs the LangGraph-based DJ engine to create a hybrid playlist that combines tracks from both users with AI-generated "wildcard" discoveries.

## Prerequisites

- Python 3.10+
- `GEMINI_API_KEY` set in your `.env` file (at `apps/data-engine/app/.env`).
- `GENIUS_ACCESS_TOKEN` (Optional) for lyrics lookup.
- `LLM_PROVIDER` and `VECTOR_DB_PROVIDER` (Optional, defaults to Gemini/Chroma).

## How to Run

1.  Navigate to the `apps/data-engine` directory:
    ```bash
    cd apps/data-engine
    ```
2.  Run the POC script:
    ```bash
    python app/poc.py
    ```

## Usage Instructions

1.  **Input Songs**: When prompted, enter songs for User A and User B in the format: `Song Title - Artist Name`.
    *   Example: `Levitating - Dua Lipa`
    *   Press **Enter twice** to finish a user's list.
    *   **Pro Tip**: You can just press Enter immediately to skip and use the built-in `MOCK_SONGS` for that user.

### 💡 How to Get Your Real Spotify Data

If you want to test with your actual music taste, here are two ways to get your Top 50 tracks in the correct format:

#### Option A: The Browser Console Trick (Fastest)
1.  Open [Spotify Web Player](https://open.spotify.com/) in Chrome/Brave/Edge.
2.  Go to your **"Liked Songs"** or any playlist you love.
3.  Press `F12` (or `Cmd+Option+I` on Mac) to open **Developer Tools** and click the **Console** tab.
4.  Paste the following script and press **Enter**:
    ```javascript
    copy(Array.from(document.querySelectorAll('[data-testid="tracklist-row"]')).map(row => {
      const title = row.querySelector('[data-testid="internal-track-link"]')?.innerText || 
                    row.querySelector('div[dir="auto"]')?.innerText;
      const artist = row.querySelector('a[href^="/artist/"]')?.innerText || 
                     row.querySelector('span[dir="auto"] > a')?.innerText;
      return `${title} - ${artist}`;
    }).filter(s => !s.includes('undefined')).join('\n'));
    console.log("Copied to clipboard! Now paste it into the POC terminal.");
    ```
5.  Go back to your terminal and **Paste** (`Ctrl+V` or `Cmd+V`).

#### Option B: Using "Stats for Spotify"
1.  Go to [statsforspotify.com](https://www.statsforspotify.com/) and log in.
2.  Click **"Top Tracks"** and select **"(Last 4 Weeks)"** or **"(Last 6 Months)"**.
3.  Highlight the list of songs and artists on the page and copy them.
4.  Paste them into a text editor and quickly format them as `Title - Artist` before pasting into the POC.

2.  **Describe Event**: Enter the vibe for the playlist (e.g., "A chill rainy afternoon study session" or "Workout energy").

3.  **Observe the Graph**: The console will show the LangGraph node execution:
    *   `[Graph] Querying Vector DB`: Searching for semantic matches in the combined library.
    *   `[Graph] LLM Generating`: Asking the configured **DJProvider** to find new songs that bridge the gaps.
    *   `[Mock Validator]`: Simulating the Spotify URI check.
4.  **Final Result**: A complete playlist will be printed, labeling each track as `[LIBRARY]` (from the input) or `[NEW]` (AI discovery).

## Why This Exists?

This tool ensures that:
- The **RAG Logic** correctly retrieves relevant songs from multiple users using the modular provider system.
- The **LangGraph Loop** correctly handles validation failures and regeneration.
- The **LLM Prompts** are producing high-quality, vibe-aligned recommendations across different models.
