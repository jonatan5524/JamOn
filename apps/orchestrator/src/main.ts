import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Enable CORS for OAuth callbacks and API requests
  app.enableCors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle('JamOn - Orchestrator Service')
    .setDescription('Core management for events and Spotify integration')
    .setVersion('1.0')
    .addTag('Events')
    .addTag('Authentication')
    .addTag('Users')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  await app.listen(3000);
}

bootstrap();
