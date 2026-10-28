import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) throw new Error(`Missing required environment variable: ${name}`);
  return value.trim();
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number.parseInt(process.env.PORT ?? '8080', 10),
  databaseUrl: required('DATABASE_URL'),
  serverKey: required('ALLCOINS_RP_SERVER_KEY'),
  internalKey: required('ALLCOINS_RP_INTERNAL_KEY'),
  allcoinsApiUrl: required('ALLCOINS_INTERNAL_API_URL').replace(/\/$/, ''),
  allcoinsApiKey: required('ALLCOINS_INTERNAL_API_KEY')
};

if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
  throw new Error('PORT must be a valid TCP port');
}
