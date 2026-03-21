import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import serverlessExpress from '@vendia/serverless-express';
import { Context, Handler } from 'aws-lambda';
import express from 'express';
import { AppModule } from './app.module';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

let cachedServer: Handler;

async function loadSecrets() {
    const client = new SecretsManagerClient({ region: 'us-east-1' });

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

        const expressApp = express();
        const nestApp = await NestFactory.create(
            AppModule,
            new ExpressAdapter(expressApp),
            { rawBody: true }
        );
        nestApp.enableCors();
        await nestApp.init(); // Essential: boots the app without starting a listener
        cachedServer = serverlessExpress({ app: expressApp });
    }
    return cachedServer;
}

export const handler: Handler = async (event: any, context: Context, callback: any) => {
    const server = await bootstrap();
    return server(event, context, callback);
};