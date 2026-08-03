// Seed/reset an allowlisted login: SEED_EMAIL + SEED_PW env → bcrypt into users.
// Run: docker compose run --rm -e SEED_EMAIL=you@x.com -e SEED_PW=secret seo-web node seed.mjs
import postgres from "postgres";
import bcrypt from "bcryptjs";
const sql = postgres(process.env.DATABASE_URL);
const email = process.env.SEED_EMAIL;
const hash = await bcrypt.hash(process.env.SEED_PW, 10);
await sql`insert into users (email, password_hash) values (${email}, ${hash})
  on conflict (email) do update set password_hash = excluded.password_hash`;
console.log("seeded:", email);
await sql.end();
