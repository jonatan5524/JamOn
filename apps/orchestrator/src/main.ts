import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Enable CORS for OAuth callbacks and API requests
  app.enableCors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  });

  await app.listen(3000);
}

bootstrap();
