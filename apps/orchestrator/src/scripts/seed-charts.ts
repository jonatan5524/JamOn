import 'reflect-metadata';
import axios from 'axios';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SongModule } from '../modules/song/song.module';
import { UserModule } from '../modules/user/user.module';
import { DataEngineModule } from '../modules/data-engine/data-engine.module';
import { SongService } from '../modules/song/song.service';
import { DataEngineService } from '../modules/data-engine/data-engine.service';
import { SimplifiedTrack } from '../modules/spotify/spotify.types';

// Apple iTunes Top Charts RSS API — free, no auth required
const APPLE_CHARTS_BASE = 'https://rss.applemarketingtools.com/api/v2';
const CHART_LIMIT = 50;

interface AppleChartResult {
  name: string;
  artistName: string;
}

interface AppleChartsResponse {
  feed: { results: AppleChartResult[] };
}

async function fetchAppleCharts(countryCode: string): Promise<SimplifiedTrack[]> {
  const url = `${APPLE_CHARTS_BASE}/${countryCode}/music/most-played/${CHART_LIMIT}/songs.json`;
  const { data } = await axios.get<AppleChartsResponse>(url);
  return data.feed.results.map((r) => ({ title: r.name, artist: r.artistName }));
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get<string>('DB_USERNAME'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_NAME'),
        synchronize: false,
        autoLoadEntities: true,
      }),
    }),
    UserModule,
    SongModule,
    DataEngineModule,
  ],
})
class SeedModule {}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(SeedModule, {
    logger: ['log', 'warn', 'error'],
  });

  const songService = app.get(SongService);
  const dataEngineService = app.get(DataEngineService);

  console.log('\n=== JamOn Chart Seeder ===\n');
  console.log('Fetching top charts...');

  const [globalTracks, israelTracks] = await Promise.all([
    fetchAppleCharts('us'),  // US chart as global proxy
    fetchAppleCharts('il'),  // Israel chart
  ]);

  console.log(`  Global Top ${CHART_LIMIT} (US): ${globalTracks.length} tracks`);
  console.log(`  Israel Top ${CHART_LIMIT}: ${israelTracks.length} tracks`);

  const seen = new Set<string>();
  const allTracks: SimplifiedTrack[] = [...globalTracks, ...israelTracks].filter((t) => {
    const key = `${t.title.toLowerCase()}::${t.artist.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`  Unique tracks total: ${allTracks.length}\n`);

  console.log('Upserting songs into DB...');
  const songs = await songService.upsertSongsFromTracks(allTracks);

  const unembedded = songs.filter((s) => s.embedding === null);
  const alreadyEmbedded = songs.length - unembedded.length;

  console.log(`  Already embedded (skipped): ${alreadyEmbedded}`);
  console.log(`  Needs embedding: ${unembedded.length}\n`);

  if (unembedded.length === 0) {
    console.log('All tracks already embedded. Nothing to do.\n');
    await app.close();
    return;
  }

  const tracksToIngest: SimplifiedTrack[] = unembedded.map((s) => ({
    title: s.name,
    artist: s.artistName,
  }));

  const BATCH_SIZE = 25;
  const BATCH_DELAY_MS = 30_000;
  const MAX_RETRIES = 3;
  const ingested: Awaited<ReturnType<typeof dataEngineService.ingestBatch>> = [];

  const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  const totalBatches = Math.ceil(tracksToIngest.length / BATCH_SIZE);
  for (let i = 0; i < tracksToIngest.length; i += BATCH_SIZE) {
    const chunk = tracksToIngest.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    let attempt = 0;
    let result: Awaited<ReturnType<typeof dataEngineService.ingestBatch>> = [];
    while (attempt < MAX_RETRIES) {
      try {
        console.log(`Sending batch ${batchNum}/${totalBatches} (${chunk.length} tracks) to data-engine...`);
        result = await dataEngineService.ingestBatch(chunk);
        console.log(`  Batch ${batchNum} done — ${result.length} embeddings received`);
        break;
      } catch (err: any) {
        attempt++;
        if (attempt >= MAX_RETRIES) throw err;
        const backoff = BATCH_DELAY_MS * attempt;
        console.warn(`  Batch ${batchNum} failed (attempt ${attempt}/${MAX_RETRIES}), retrying in ${backoff / 1000}s...`);
        await delay(backoff);
      }
    }

    ingested.push(...result);

    if (i + BATCH_SIZE < tracksToIngest.length) {
      console.log(`  Waiting ${BATCH_DELAY_MS / 1000}s before next batch...`);
      await delay(BATCH_DELAY_MS);
    }
  }

  console.log(`\n  Total embeddings from data-engine: ${ingested.length}\n`);

  await songService.updateEmbeddings(ingested);

  console.log('=== Seed complete ===');
  console.log(`  Total fetched:              ${allTracks.length}`);
  console.log(`  Skipped (already embedded): ${alreadyEmbedded}`);
  console.log(`  Newly embedded:             ${ingested.length}\n`);

  await app.close();
}

bootstrap().catch((err) => {
  console.error('Seed script failed:', err);
  process.exit(1);
});
