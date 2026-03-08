import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
