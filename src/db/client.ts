import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { loadEnv } from "@/config/env";
const sql = postgres(loadEnv().DATABASE_URL, { max: 5 });
export const db = drizzle(sql, { schema });
