import { INestApplication } from "@nestjs/common";
import helmet from "helmet";
import compression from "compression";
import { json, urlencoded } from "express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { ValidationPipe } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";

export function configureApp(app: INestApplication) {
    app.use(
        helmet({
            crossOriginEmbedderPolicy: process.env.NODE_ENV === 'production',
            contentSecurityPolicy: process.env.NODE_ENV === 'production'
                ? {
                    directives: {
                        defaultSrc: ["'self'"],
                        styleSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com', 'https://fonts.googleapis.com'],
                        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cdnjs.cloudflare.com'],
                        imgSrc: ["'self'", 'data:', 'https://validator.swagger.io'],
                        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
                    },
                }
                : false,
        }),
    );

    // Compress all responses — saves 60-80% on large GTFS-RT payloads.
    app.use(compression());

    // app.use(json());
    // app.use(urlencoded({ extended: true }));


    const jsonParser = json();
    const urlencodedParser = urlencoded({ extended: true });

    // // Skip body parsing only for better-auth routes — it parses its own body
    // // internally and will fail if Express already consumed the stream.
    // // Our own /auth/supabase/* routes still need standard body parsing.
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

    // CORS: restrict to ALLOWED_ORIGINS (comma-separated) when set;
    // falls back to '*' (allow all) for local development.
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map((o) =>
        o.trim(),
    ).filter(Boolean);
    if (process.env.NODE_ENV === 'production' && !allowedOrigins.length) {
        throw new Error(
            'ALLOWED_ORIGINS must be set in production. Set comma-separated origins (e.g. https://myapp.example.com).',
        );
    }
    app.enableCors({
        origin: allowedOrigins?.length ? allowedOrigins : '*',
        credentials: true,
    });

    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            transform: true,
            forbidNonWhitelisted: true,
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
        .addTag('Admin', 'Admin dashboard: users, API keys, logs, stats, GTFS management, health')
        .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
        jsonDocumentUrl: '/api/docs-json',
        yamlDocumentUrl: '/api/docs-yaml',
        // Add a custom CSS file to override the default styles that aren't accessible in Lambda
        customCssUrl: 'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui.min.css',
        customJs: [
            'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-bundle.js',
            'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-standalone-preset.js'
        ]
    });
}
