import { pgTable, uuid, text, integer, boolean, timestamp, jsonb, numeric, real } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("member"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  defaultLocationCode: integer("default_location_code").notNull().default(2840), // US
  defaultLanguageCode: text("default_language_code").notNull().default("en"),
  defaultDevice: text("default_device").notNull().default("desktop"),
  refreshCadence: text("refresh_cadence").notNull().default("weekly"), // daily | weekly
  // Per-project override for scoreOpportunity's blend (Weights: volume/winnability/
  // position/trend/relevance). Nullable — null means "never tuned", and
  // weeklyOpportunitiesHandler passes `undefined` through to assembleOpportunities,
  // which falls back to DEFAULT_WEIGHTS. Set via POST /api/projects/[id]/settings.
  opportunityWeights: jsonb("opportunity_weights").$type<Record<string, number>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const competitors = pgTable("competitors", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  domain: text("domain").notNull(),
});

export const keywords = pgTable("keywords", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  keyword: text("keyword").notNull(),
  locationCode: integer("location_code").notNull(),
  languageCode: text("language_code").notNull(),
  device: text("device").notNull().default("desktop"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  isTracked: boolean("is_tracked").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const rankSnapshots = pgTable("rank_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  keywordId: uuid("keyword_id").notNull().references(() => keywords.id, { onDelete: "cascade" }),
  capturedAt: timestamp("captured_at").defaultNow().notNull(),
  rankAbsolute: integer("rank_absolute"),
  rankGroup: integer("rank_group"),
  url: text("url"),
  serpFeatures: jsonb("serp_features").$type<string[]>().notNull().default([]),
  fetchStatus: text("fetch_status").notNull().default("ok"), // ok | failed
  reason: text("reason"),
  ownUrls: jsonb("own_urls").$type<string[]>().notNull().default([]),
});

export const keywordMetrics = pgTable("keyword_metrics", {
  keywordId: uuid("keyword_id").primaryKey().references(() => keywords.id, { onDelete: "cascade" }),
  searchVolume: integer("search_volume"),
  cpc: real("cpc"),
  competition: real("competition"),
  difficulty: integer("difficulty"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const competitorGaps = pgTable("competitor_gaps", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  competitorDomain: text("competitor_domain").notNull(),
  keyword: text("keyword").notNull(),
  competitorRank: integer("competitor_rank"),
  ourRank: integer("our_rank"),
  volume: integer("volume"),
  difficulty: integer("difficulty"),
  capturedAt: timestamp("captured_at").defaultNow().notNull(),
});

export const opportunities = pgTable("opportunities", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  keywordId: uuid("keyword_id").references(() => keywords.id, { onDelete: "set null" }),
  keyword: text("keyword").notNull().default(""), // always present (EngineResult.keyword) — the only structured way to recover a gap row's keyword, since gap candidates have keywordId: null
  volume: integer("volume"), // §8 advisor card metrics row — copied from the scored Candidate, self-contained even for gap rows (keywordId null, can't re-join to keywords)
  difficulty: integer("difficulty"),
  currentPosition: integer("current_position"),
  trend: integer("trend"),
  type: text("type").notNull(),
  score: real("score").notNull(),
  scoreBreakdown: jsonb("score_breakdown").$type<Record<string, number>>().notNull().default({}),
  why: text("why").notNull(),
  upsideEstimate: text("upside_estimate"),
  status: text("status").notNull().default("new"), // new | tracked | dismissed | done
  weekOf: text("week_of").notNull(), // ISO date of the Monday
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const jobs = pgTable("jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  type: text("type").notNull(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  dedupeKey: text("dedupe_key").notNull().unique(), // `${type}:${projectId}:${date}`
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  status: text("status").notNull().default("pending"), // pending | running | done | failed
  scheduledFor: timestamp("scheduled_for").defaultNow().notNull(),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  rowsConsumed: integer("rows_consumed").notNull().default(0),
  estCost: numeric("est_cost").notNull().default("0"),
  error: text("error"),
});

export const apiUsage = pgTable("api_usage", {
  id: uuid("id").defaultRandom().primaryKey(),
  occurredAt: timestamp("occurred_at").defaultNow().notNull(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  endpoint: text("endpoint").notNull(),
  rows: integer("rows").notNull().default(0),
  estCost: numeric("est_cost").notNull().default("0"),
});
