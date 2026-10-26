import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const client = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 15, ...(process.env.DATABASE_REQUIRE_TLS === "true" ? { ssl: { rejectUnauthorized: true } } : {}) });
try {
  await client`SELECT pg_advisory_lock(721934801)`;
  await migrate(drizzle(client), { migrationsFolder: './drizzle' });
  console.log('Database migrations complete.');
} catch {
  console.error('Database migration failed. Check database connectivity and migration history.');
  process.exitCode = 1;
} finally {
  await client`SELECT pg_advisory_unlock(721934801)`.catch(() => {});
  await client.end({ timeout: 5 });
}
