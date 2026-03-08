import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import type { Request, Response, NextFunction } from 'express';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  // Disable NestJS's built-in body parser so better-auth can read the raw
  // request body on /auth/* routes via its own toNodeHandler.
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  const jsonParser = json();
  const urlencodedParser = urlencoded({ extended: true });

  // Apply body parsers to every route EXCEPT /auth/* — better-auth parses
  // its own body internally and will fail if Express already consumed the stream.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/auth/')) return next();
    return jsonParser(req, res, next);
  });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/auth/')) return next();
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
      'A fully-functional GraphQL + REST wrapper for NSW Open Data Transport. Authenticate with better-auth (email/password or Supabase SSO) to obtain a session token, then create an API key to call transport endpoints.',
    )
    .setVersion('1.0')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-API-Key' }, 'X-API-Key')
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
  console.log(`🚉 NSW Transport API running on: http://localhost:${port}`);
  console.log(`📖 REST docs: http://localhost:${port}/api/docs`);
  console.log(`🔮 GraphQL: http://localhost:${port}/graphql`);
}

void bootstrap();
