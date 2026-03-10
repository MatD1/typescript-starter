import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import type { Request, Response, NextFunction } from 'express';
import { json, urlencoded } from 'express';
import compression from 'compression';
import { AppModule } from './app.module';
import { runMigrations } from './database/migration.runner';

async function bootstrap() {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl && process.env.RUN_MIGRATIONS_ON_STARTUP !== 'false') {
    await runMigrations(databaseUrl, {
      maxRetries: parseInt(process.env.MIGRATION_MAX_RETRIES ?? '4', 10),
      retryDelayMs: parseInt(process.env.MIGRATION_RETRY_DELAY_MS ?? '3000', 10),
    });
  }

  // Disable NestJS's built-in body parser so better-auth can read the raw
  // request body on /auth/* routes via its own toNodeHandler.
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  // Compress all responses — saves 60-80% on large GTFS-RT payloads.
  app.use(compression());

  const jsonParser = json();
  const urlencodedParser = urlencoded({ extended: true });

  // Skip body parsing only for better-auth routes — it parses its own body
  // internally and will fail if Express already consumed the stream.
  // Our own /auth/supabase/* routes still need standard body parsing.
  const isBetterAuthRoute = (path: string) =>
    path.startsWith('/auth/') &&
    !path.startsWith('/auth/supabase/') &&
    path !== '/auth/refresh';

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (isBetterAuthRoute(req.path)) return next();
    return jsonParser(req, res, next);
  });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (isBetterAuthRoute(req.path)) return next();
    return urlencodedParser(req, res, next);
  });

  app.setGlobalPrefix('api/v1', {
    exclude: ['/auth/(.*)', '/graphql'],
  });

  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? '*',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('NSW Transport API')
    .setDescription(
      'A fully-functional GraphQL + REST wrapper for NSW Open Data Transport. Authenticate with better-auth (email/password or Supabase SSO) to obtain a session token, then call transport endpoints with Bearer token or create an API key for server-to-server use.',
    )
    .setVersion('1.0')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-API-Key' }, 'X-API-Key')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'session-token' },
      'Bearer',
    )
    .addTag('realtime', 'Live vehicle positions and trip updates')
    .addTag('disruptions', 'Service alerts and disruptions')
    .addTag('trip-planner', 'Journey planning and departure boards')
    .addTag('stations', 'Station and stop search')
    .addTag('gtfs-static', 'GTFS static timetable data')
    .addTag('auth', 'Authentication and API key management')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`NSW Transport API running on: http://localhost:${port}`);
  console.log(`REST docs: http://localhost:${port}/api/docs`);
  console.log(`GraphQL: http://localhost:${port}/graphql`);
}

void bootstrap();
