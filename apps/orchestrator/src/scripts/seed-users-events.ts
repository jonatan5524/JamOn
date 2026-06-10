import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../modules/user/user.entity';
import { Song } from '../modules/song/song.entity';
import { SongLike } from '../modules/song/song-like.entity';
import { Event } from '../modules/event/event.entity';
import { EventParticipant } from '../modules/event/event-participant.entity';
import { generateEventCode } from '../modules/event/event-code.util';

const LIKES_PER_USER = 50;

const MOCK_USERS = [
  { spotifyId: 'mock_spotify_001', email: 'alex@jamon.dev',   displayName: 'Alex'   },
  { spotifyId: 'mock_spotify_002', email: 'maya@jamon.dev',   displayName: 'Maya'   },
  { spotifyId: 'mock_spotify_003', email: 'jordan@jamon.dev', displayName: 'Jordan' },
  { spotifyId: 'mock_spotify_004', email: 'sam@jamon.dev',    displayName: 'Sam'    },
  { spotifyId: 'mock_spotify_005', email: 'riley@jamon.dev',  displayName: 'Riley'  },
];

const MOCK_EVENTS = [
  { title: 'Summer Rooftop Party',     context: 'High energy summer night, rooftop, dancing'  },
  { title: 'Late Night Study Session', context: 'Focused, calm, lo-fi, late night studying'   },
  { title: 'Friday Night Pre-game',    context: 'Pre-party hype, upbeat, get ready vibes'     },
];

// Event[i] is created by users[creatorIndex[i]]; participantIndexes[i] are added as participants
const EVENT_CREATOR_INDEXES   = [0, 1, 2];
const EVENT_PARTICIPANT_INDEXES = [
  [1, 2],       // event 0: creator=user[0], extra participants: user[1], user[2]
  [0, 2, 3],    // event 1: creator=user[1], extra participants: user[0], user[2], user[3]
  [3, 4],       // event 2: creator=user[2], extra participants: user[3], user[4]
];

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
    TypeOrmModule.forFeature([User, Song, SongLike, Event, EventParticipant]),
  ],
})
class SeedModule {}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(SeedModule, {
    logger: ['log', 'warn', 'error'],
  });

  const userRepo      = app.get<Repository<User>>(getRepositoryToken(User));
  const songRepo      = app.get<Repository<Song>>(getRepositoryToken(Song));
  const songLikeRepo  = app.get<Repository<SongLike>>(getRepositoryToken(SongLike));
  const eventRepo     = app.get<Repository<Event>>(getRepositoryToken(Event));
  const participantRepo = app.get<Repository<EventParticipant>>(getRepositoryToken(EventParticipant));

  console.log('\n=== JamOn Users & Events Seeder ===\n');

  // Guard: need enough songs in the DB
  const allSongs = await songRepo.find();
  if (allSongs.length < LIKES_PER_USER) {
    console.error(
      `Not enough songs in DB (found ${allSongs.length}, need ${LIKES_PER_USER}).\n` +
      'Run "npm run seed:charts" first to populate the songs table.',
    );
    await app.close();
    process.exit(1);
  }
  console.log(`Found ${allSongs.length} songs in DB.\n`);

  // --- 1. Upsert mock users ---
  console.log('Upserting mock users...');
  const users: User[] = [];
  let newUserCount = 0;

  for (const mock of MOCK_USERS) {
    const existing = await userRepo.findOne({ where: { spotifyId: mock.spotifyId } });
    if (existing) {
      console.log(`  Skipped (already exists): ${mock.displayName}`);
      users.push(existing);
    } else {
      const user = userRepo.create(mock);
      const saved = await userRepo.save(user);
      console.log(`  Created: ${mock.displayName} (${saved.id})`);
      users.push(saved);
      newUserCount++;
    }
  }
  console.log(`  Done — ${newUserCount} new, ${users.length - newUserCount} skipped.\n`);

  // --- 2. Assign 50 random liked songs per user ---
  console.log(`Assigning ${LIKES_PER_USER} random liked songs per user...`);
  for (const user of users) {
    const shuffled = [...allSongs].sort(() => Math.random() - 0.5);
    const picks = shuffled.slice(0, LIKES_PER_USER);

    await songLikeRepo
      .createQueryBuilder()
      .insert()
      .into(SongLike)
      .values(picks.map((s) => ({ userId: user.id, songId: s.id })))
      .orIgnore()
      .execute();

    console.log(`  ${user.displayName}: ${picks.length} songs liked`);
  }
  console.log();

  // --- 3. Upsert mock events ---
  console.log('Upserting mock events...');
  const events: Event[] = [];
  let newEventCount = 0;

  for (let i = 0; i < MOCK_EVENTS.length; i++) {
    const mock = MOCK_EVENTS[i];
    const creator = users[EVENT_CREATOR_INDEXES[i]];

    const existing = await eventRepo.findOne({ where: { title: mock.title } });
    if (existing) {
      console.log(`  Skipped (already exists): "${mock.title}"`);
      events.push(existing);
      continue;
    }

    // Retry code generation on unique collision (matches EventsService pattern)
    let saved: Event | undefined;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const newEvent = eventRepo.create({
          title: mock.title,
          context: mock.context,
          code: generateEventCode(),
          createdBy: creator.id,
        });
        saved = await eventRepo.save(newEvent);
        break;
      } catch (err: any) {
        if (err?.code === '23505') continue; // unique code collision — retry
        throw err;
      }
    }
    if (!saved) throw new Error(`Failed to generate unique code for event "${mock.title}"`);

    console.log(`  Created: "${mock.title}" [${saved.code}] by ${creator.displayName}`);
    events.push(saved);
    newEventCount++;
  }
  console.log(`  Done — ${newEventCount} new, ${events.length - newEventCount} skipped.\n`);

  // --- 4. Add participants to events ---
  console.log('Adding event participants...');
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const creator = users[EVENT_CREATOR_INDEXES[i]];

    // Always ensure the creator has a participant row
    const allParticipantIndexes = [EVENT_CREATOR_INDEXES[i], ...EVENT_PARTICIPANT_INDEXES[i]];

    for (const userIndex of allParticipantIndexes) {
      const user = users[userIndex];
      await participantRepo
        .createQueryBuilder()
        .insert()
        .into(EventParticipant)
        .values({ eventId: event.id, userId: user.id })
        .orIgnore()
        .execute();
    }

    const participantNames = allParticipantIndexes.map((idx) => users[idx].displayName).join(', ');
    console.log(`  "${event.title}": ${participantNames}`);
  }
  console.log();

  // --- Summary ---
  console.log('=== Seed complete ===');
  console.log(`  Users:  ${users.length} total (${newUserCount} new)`);
  console.log(`  Events: ${events.length} total (${newEventCount} new)`);
  console.log(`  Song likes: ${LIKES_PER_USER} per user (${users.length * LIKES_PER_USER} total inserted)\n`);

  await app.close();
}

bootstrap().catch((err) => {
  console.error('Seed script failed:', err);
  process.exit(1);
});
