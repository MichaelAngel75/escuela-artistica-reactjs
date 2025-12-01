// import { Pool, neonConfig } from '@neondatabase/serverless';
// import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
// import ws from "ws";
import * as schema from "@shared/schema";

// neonConfig.webSocketConstructor = ws;

if (!process.env.ACADEMY_DATABASE_URL) {
  throw new Error(
    "ACADEMY_DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// export const pool = new Pool({ connectionString: process.env.ACADEMY_DATABASE_URL });
// export const db = drizzle({ client: pool, schema });

const pool = new Pool({
  connectionString: process.env.ACADEMY_DATABASE_URL,
  max: 15, // max connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 6000,
  ssl: { rejectUnauthorized: false },
});

// Initialize Drizzle ORM
// export const db = drizzle({ client: pool, schema });
export const db = drizzle(pool, { schema });