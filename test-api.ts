import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { AuthService } from './src/auth/auth.service';
import { user } from './src/database/schema/auth.schema';
import { eq } from 'drizzle-orm';

async function test() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const auth = app.get(AuthService);
    const headers = new Headers({
        authorization: 'Bearer e60a518f-5039-4ed7-8438-64b53344095e'
    });

    console.log('Sending listUsers...');
    try {
        const result = await auth.auth.api.listUsers({
            query: { limit: 10, offset: 0 },
            headers
        });
        console.log('Result length:', result.users.length);
    } catch (e: any) {
        console.log('CAUGHT:', e?.message || e);
        if (e?.status) console.log('STATUS:', e.status);
        if (e?.stack) console.log('STACK:', e.stack);
    }
    await app.close();
}
test();
