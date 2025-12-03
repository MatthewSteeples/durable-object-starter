import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import type * as schema from "./schemas";
import { SubscriptionRecords } from "./SubscriptionRecords";

export type DB = DrizzleSqliteDODatabase<typeof schema>;

export type SubscriptionRecord = typeof SubscriptionRecords.$inferSelect;
export type InsertSubscriptionRecord = typeof SubscriptionRecords.$inferInsert;
