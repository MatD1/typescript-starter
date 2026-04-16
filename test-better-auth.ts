import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { AuthService } from './src/auth/auth.service';
import { AdminService } from './src/admin/admin.service';
import { user, session } from './src/database/schema/auth.schema';
import { eq } from 'drizzle-orm';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const authService = app.get(AuthService);
  const db = (authService as any).db;

  try {
    // 1. Get an admin user
    const adminUser = await db.select().from(user).where(eq(user.role, 'admin')).limit(1);
    if (!adminUser.length) throw new Error('No admin user found');
    console.log('Admin user:', adminUser[0].email);

    // 2. Create a session for this user
    const createdSession = await authService.auth.api.createSession({
      body: {
        userId: adminUser[0].id,
      }
    });
    console.log('Session token:', createdSession.token);

    // 3. Call listUsers using this session token
    const headers = new Headers();
    headers.set('authorization', `Bearer ${createdSession.token}`);

    console.log('Calling listUsers...');
    const result = await authService.auth.api.listUsers({
      headers,
      query: { limit: 10, offset: 0 }
    });
    console.log('Success!', result.users.length, 'users found');

  } catch (e) {
    console.log('ERROR:', e.message);
    if (e.status) console.log('Status:', e.status);
    if (e.stack) console.log('Stack:', e.stack);
  }
  
  await app.close();
}
bootstrap();
