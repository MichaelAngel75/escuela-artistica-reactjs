// server/db.ts

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import "dotenv/config";

const secretName = process.env.ACADEMY_DB_SECRET_MANAGER;
const region = process.env.ACADEMY_AWS_REGION;

// Basic sanity checks (no await here, so it's fine)
if (!secretName) {
  throw new Error("ACADEMY_DB_SECRET_MANAGER must be set");
}
if (!region) {
  throw new Error("AWS_REGION must be set");
}

const secretsClient = new SecretsManagerClient({ region });

let pool: Pool | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

async function ensureConnectionString(): Promise<string> {
  if (process.env.ACADEMY_DATABASE_URL) {
    return process.env.ACADEMY_DATABASE_URL;
  }

  // 🔐 Fetch secret only once when first needed
  const response = await secretsClient.send(
    new GetSecretValueCommand({
      SecretId: secretName,
      VersionStage: "AWSCURRENT",
    }),
  );

  if (!response.SecretString) {
    throw new Error("SecretString is empty in Secrets Manager response");
  }

  const secretObj = JSON.parse(response.SecretString) as {
    db_user?: string;
    db_password?: string;
    db_to_concatenate_1?: string;
    db_to_concatenate_2?: string;
  };

  const { db_user, db_password, db_to_concatenate_1, db_to_concatenate_2 } =
    secretObj;

    
  if (!db_user || !db_password || !db_to_concatenate_1 || !db_to_concatenate_2) {
    throw new Error(`Missing required components for ACADEMY_DATABASE_URL`);
  }

  const connStr = `${db_to_concatenate_1}${db_user}:${db_password}${db_to_concatenate_2}`;
  process.env.ACADEMY_DATABASE_URL = connStr;
  return connStr;
}

async function createPool(): Promise<Pool> {
  if (pool) return pool;

  const connectionString = await ensureConnectionString();

  pool = new Pool({
    connectionString,
    max: 15,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 6000,
    ssl:  {
      rejectUnauthorized: false
    }
    // ssl: { rejectUnauthorized: false },
  });

  pool.on("connect", (client) => {
    // @ts-ignore
    console.log("PG SSL:", client.ssl ? "ON" : "OFF");
  });

  return pool;
}

// ✅ Export Pool for other modules (e.g., connect-pg-simple)
export async function getPool(): Promise<Pool> {
  return createPool();
}


// ✅ Main entry for the rest of your app
export async function getDb() {
  if (dbInstance) return dbInstance;

  const pool = await createPool();
  dbInstance = drizzle(pool, { schema });
  return dbInstance;
}
