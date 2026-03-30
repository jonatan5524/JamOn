import * as cheerio from "cheerio";
import dotenv from "dotenv";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const PORT = Number(process.env.PORT || 3001);
const GENIUS_ACCESS_TOKEN = process.env.GENIUS_ACCESS_TOKEN;
const GENIUS_API_BASE_URL = "https://api.genius.com";
const LYRICS_SECTION_REGEX = /\[(Verse|Chorus|Pre-Chorus|Post-Chorus|Bridge|Outro|Intro|Refrain|Hook|Interlude|Instrumental)[^\]]*\]/i;
const BRACKETED_SECTION_LABEL_REGEX = /(^|\n)\s*\[[^\]\n]{1,80}\]\s*(?=\n|$)/g;

function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanupLyrics(lyrics) {
  if (!lyrics) {
    return "";
  }

  let cleaned = lyrics.trim();

  cleaned = cleaned.replace(/^\d+\s+Contributors?/i, "");
  cleaned = cleaned.replace(/^.*?Lyrics/i, "");
  cleaned = cleaned.replace(/Translations.*?(?=\[|[A-Za-z])/is, "");
  cleaned = cleaned.replace(/See .*? Live.*?(?=\[|[A-Za-z])/is, "");
  cleaned = cleaned.replace(/You might also like/gi, "");
  cleaned = cleaned.replace(/Read More\s*/gi, "");
  cleaned = cleaned.replace(/&nbsp;/gi, " ");
  cleaned = cleaned.replace(/^\s*Embed\s*$/gim, "");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();

  // Genius sometimes prepends editorial descriptions before the actual lyrics.
  // If section labels exist, treat the first label as the true lyrics start.
  const firstBracketedSectionIndex = cleaned.search(LYRICS_SECTION_REGEX);
  if (firstBracketedSectionIndex > 0) {
    cleaned = cleaned.slice(firstBracketedSectionIndex).trim();
  }

  cleaned = cleaned.replace(BRACKETED_SECTION_LABEL_REGEX, "\n");
  cleaned = cleaned.replace(/[ \t]+\n/g, "\n");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();

  return cleaned;
}

function extractLyricsFromHtml(html) {
  const $ = cheerio.load(html);
  const sections = [];

  $("[data-lyrics-container='true']").each((_, element) => {
    const fragmentHtml = $(element).html() || "";
    const cleaned = stripHtml(fragmentHtml);
    if (cleaned) {
      sections.push(cleaned);
    }
  });

  return sections.join("\n").trim();
}

async function searchSongOnGenius(title, artist) {
  const searchUrl = new URL("/search", GENIUS_API_BASE_URL);
  searchUrl.search = new URLSearchParams({
    q: `${title} ${artist}`.trim()
  }).toString();

  const response = await fetch(searchUrl, {
    headers: {
      Authorization: `Bearer ${GENIUS_ACCESS_TOKEN}`
    }
  });

  if (!response.ok) {
    throw new Error(`Genius search failed with status ${response.status}.`);
  }

  const data = await response.json();
  const hits = data?.response?.hits || [];

  for (const hit of hits) {
    if (hit?.type !== "song" || !hit.result?.url) {
      continue;
    }

    const primaryArtist = (hit.result.primary_artist?.name || "").toLowerCase();
    const requestedArtist = artist.toLowerCase();
    if (primaryArtist.includes(requestedArtist) || requestedArtist.includes(primaryArtist)) {
      return hit.result;
    }
  }

  return hits.find((hit) => hit?.type === "song")?.result || null;
}

async function fetchLyricsForSong(title, artist) {
  const song = await searchSongOnGenius(title, artist);
  if (!song?.url) {
    return {
      title,
      artist,
      found: false,
      lyrics: ""
    };
  }

  const pageResponse = await fetch(song.url);
  if (!pageResponse.ok) {
    throw new Error(`Failed to fetch Genius song page with status ${pageResponse.status}.`);
  }

  const html = await pageResponse.text();
  const extractedLyrics = extractLyricsFromHtml(html);
  const lyrics = cleanupLyrics(extractedLyrics);

  return {
    title,
    artist,
    found: Boolean(lyrics),
    genius_url: song.url,
    lyrics
  };
}

async function handleLyricsBatch(req, res) {
  if (!GENIUS_ACCESS_TOKEN) {
    res.status(500).json({
      error: "GENIUS_ACCESS_TOKEN is not configured."
    });
    return;
  }

  const songs = Array.isArray(req.body?.songs) ? req.body.songs : [];
  if (songs.length === 0) {
    res.status(400).json({ error: "Request body must include a non-empty 'songs' array." });
    return;
  }

  const results = [];
  for (const song of songs) {
    const title = String(song.title || "").trim();
    const artist = String(song.artist || "").trim();

    if (!title || !artist) {
      results.push({
        title,
        artist,
        found: false,
        lyrics: "",
        error: "Song must include both title and artist."
      });
      continue;
    }

    try {
      const result = await fetchLyricsForSong(title, artist);
      results.push(result);
    } catch (error) {
      results.push({
        title,
        artist,
        found: false,
        lyrics: "",
        error: error.message
      });
    }
  }

  res.status(200).json({ songs: results });
}

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

const app = express();

app.use(express.json({ limit: "1mb" }));

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.post("/lyrics/batch", asyncHandler(handleLyricsBatch));

app.use((req, res) => {
  res.status(404).json({ error: "Not found." });
});

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) {
    next(error);
    return;
  }

  res.status(500).json({ error: "Internal server error." });
});

app.listen(PORT, () => {
  console.log(`JamOn lyrics server listening on http://localhost:${PORT}`);
});
