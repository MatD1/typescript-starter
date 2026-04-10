import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import serverlessExpress from '@vendia/serverless-express';
import { Context, Handler } from 'aws-lambda';
import express from 'express';
import { AppModule } from './app.module';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { configureApp } from './setup-app';
import { runMigrations } from './database/migration.runner';

let cachedServer: Handler;

async function loadSecrets() {
    const endpoint = process.env.AWS_ENDPOINT_URL ||
        (process.env.LOCALSTACK_HOSTNAME ? `http://${process.env.LOCALSTACK_HOSTNAME}:4566` : undefined);
    const client = new SecretsManagerClient({
        region: 'us-east-1',
        ...(endpoint ? { endpoint } : {})
    });

    try {
        const response = await client.send(
            new GetSecretValueCommand({ SecretId: "nestjs-api-secrets" })
        );

        if (response.SecretString) {
            const secrets = JSON.parse(response.SecretString);
            Object.assign(process.env, secrets);
            console.log("Secrets loaded successfully")
        }
    } catch (error) {
        console.error("Failed to fetch secrets", error)
    }
}

async function bootstrap() {
    if (!cachedServer) {
        await loadSecrets();

        const databaseUrl = process.env.DATABASE_URL;
        if (databaseUrl && process.env.RUN_MIGRATIONS_ON_STARTUP !== 'false') {
            await runMigrations(databaseUrl, {
                maxRetries: 4,
                retryDelayMs: 3000,
            });
        }

        const expressApp = express();
        const nestApp = await NestFactory.create(
            AppModule,
            new ExpressAdapter(expressApp),
            { bodyParser: false }
        );
        configureApp(nestApp);
        await nestApp.init(); // Essential: boots the app without starting a listener
        cachedServer = serverlessExpress({ app: expressApp });
    }
    return cachedServer;
}

export const handler: Handler = async (event: any, context: Context) => {
    // TELL LAMBDA TO RETURN IMMEDIATELY
    context.callbackWaitsForEmptyEventLoop = false;
    const server = await bootstrap();
    // Pass undefined for callback to satisfy the type
    return server(event, context, undefined as any);
};