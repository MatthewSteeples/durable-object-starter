import { eq } from "drizzle-orm";
import { SubscriptionRecords } from "./SubscriptionRecords";
import { DB, InsertSubscriptionRecord, SubscriptionRecord } from "./types";

// Create a new subscription or update an existing one
export async function create(db: DB, subscriptionRecord: InsertSubscriptionRecord): Promise<SubscriptionRecord> {
  const [res] = await db
    .insert(SubscriptionRecords)
    .values(subscriptionRecord)
    .onConflictDoUpdate({
      target: [SubscriptionRecords.endpoint],
      set: subscriptionRecord,
    })
    .returning();

  return res;
}

// Delete a subscription by endpoint
export async function del(db: DB, params: { endpoint: string }): Promise<SubscriptionRecord> {
  const [subscription] = await db
    .delete(SubscriptionRecords)
    .where(eq(SubscriptionRecords.endpoint, params.endpoint))
    .returning();
  return subscription;
}

// Get a subscription by endpoint
export async function get(db: DB, params: { endpoint: string }): Promise<SubscriptionRecord | null> {
  const [result] = await db
    .select()
    .from(SubscriptionRecords)
    .where(eq(SubscriptionRecords.endpoint, params.endpoint));
  if (!result) return null;
  return result;
}

// List all notes
export async function list(db: DB): Promise<SubscriptionRecord[]> {
  const ns = await db
    .select()
    .from(SubscriptionRecords)
  return ns;
}
