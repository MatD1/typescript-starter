import * as authSchema from './src/database/schema/auth.schema';
import * as gtfsSchema from './src/database/schema/gtfs.schema';

export default {
  schema: { ...authSchema, ...gtfsSchema },
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
};
