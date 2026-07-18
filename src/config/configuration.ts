export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',

  auth: {
    secret: process.env.BETTER_AUTH_SECRET,
    url: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
  },

  database: {
    url: process.env.DATABASE_URL,
  },

  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },

  transport: {
    apiKey: process.env.NSW_TRANSPORT_API_KEY,
    staticApiKey: process.env.NSW_TRANSPORT_STATIC_API_KEY,
    baseUrl:
      process.env.NSW_TRANSPORT_BASE_URL ?? 'https://api.transport.nsw.gov.au',
  },

  s3: {
    endpoint: process.env.S3_ENDPOINT ?? process.env.AWS_ENDPOINT_URL,
    region: process.env.S3_REGION ?? process.env.AWS_REGION ?? 'auto',
    bucket: process.env.S3_BUCKET ?? process.env.AWS_S3_BUCKET,
    accessKeyId:
      process.env.S3_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey:
      process.env.S3_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY,
  },

  supabase: {
    url: process.env.SUPABASE_URL,
    jwtSecret: process.env.SUPABASE_JWT_SECRET,
  },

  cors: {
    allowedOrigins: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',')
        .map((o) => o.trim())
        .filter(Boolean)
      : [],
  },

  session: {
    ttlSeconds: parseInt(process.env.SESSION_TTL_SECONDS ?? '3600', 10),
    refreshTokenTtlSeconds: parseInt(
      process.env.REFRESH_TOKEN_TTL_SECONDS ?? '604800',
      10,
    ), // 7 days
  },
});
