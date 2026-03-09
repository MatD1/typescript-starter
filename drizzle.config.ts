export default {
  schema: [
    './src/database/schema/auth.schema.ts',
    './src/database/schema/gtfs.schema.ts',
    './src/database/schema/request-log.schema.ts',
  ],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
};
