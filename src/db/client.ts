import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/arkadia";

// lazy client — postgres.js 不会在构造时建连
const queryClient = postgres(connectionString, { max: 10 });

export const db = drizzle(queryClient, { schema });

export type Db = typeof db;
export type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
