import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// type SubscriptionRecord = {
// 	endpoint: string;
// 	keys_p256dh: string;
// 	keys_auth: string;
// };

export const SubscriptionRecords = sqliteTable("subscription_records", {
	endpoint: text().primaryKey(),
	keys_p256dh: text().notNull(),
	keys_auth: text().notNull(),
});
