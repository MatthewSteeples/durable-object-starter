import { DurableObject } from "cloudflare:workers";
import { drizzle } from 'drizzle-orm/durable-sqlite';
import { PushSubscription, sendNotification, WebPushError, RequestOptions } from 'web-push';
import { migrate } from 'drizzle-orm/durable-sqlite/migrator';
import migrations from '../drizzle/migrations';
import * as schema from "./db/schemas";
import * as subscriptionRecords from "./db/index";

import { DB } from './db/types';

/** A Durable Object's behavior is defined in an exported Javascript class */
export class MyDurableObject extends DurableObject {
	private storage: DurableObjectStorage;
	private db: DB;

	private readonly gcmApiKey: string;
	private readonly localEnv: Env;

	private initialized = false;

	/**
	 * The constructor is invoked once upon creation of the Durable Object, i.e. the first call to
	 * 	`DurableObjectStub::get` for a given identifier (no-op constructors can be omitted)
	 *
	 * @param ctx - The interface for interacting with Durable Object state
	 * @param env - The interface to reference bindings declared in wrangler.jsonc
	 */
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);

		this.localEnv = env;
		this.gcmApiKey = env.GCM_APIKey;

		this.storage = ctx.storage;
		this.db = drizzle(this.storage, { schema, logger: false });

		// Run migrations before accepting any requests
		this.ctx.blockConcurrencyWhile(async () => {
			await migrate(this.db, migrations);
		});
	}

	/**
	 * The Durable Object exposes an RPC method sayHello which will be invoked when when a Durable
	 *  Object instance receives a request from a Worker via the same method invocation on the stub
	 *
	 * @param name - The name provided to a Durable Object instance from a Worker
	 * @returns The greeting to be sent back to the Worker
	 */
	async sayHello(name: string): Promise<string> {
		return `Hello, ${name}! From Durable Object ${this.ctx.id.toString()}`;
	}

	async registerNotification(subscription: PushSubscription): Promise<void> {

		console.log("Registering Subscription:", this.ctx.id);

		await subscriptionRecords.create(this.db, {
			endpoint: subscription.endpoint,
			keys_p256dh: subscription.keys.p256dh,
			keys_auth: subscription.keys.auth
		});

		console.log("Subscription registered:", subscription.endpoint);

		let currentAlarm = await this.ctx.storage.getAlarm();
		if (currentAlarm == null || currentAlarm <= Date.now()) {
			var alarmTime = new Date(Date.now() + 10 * 1000); // 10 seconds in the future
			console.log("Setting alarm for 10 seconds in the future: ", alarmTime);
			await this.ctx.storage.setAlarm(alarmTime);
		}
		else {
			console.log("Alarm already set for:", new Date(currentAlarm));
		}
	}

	async alarm() {
		console.log("Alarm triggered: ", this.ctx.id);

		var subscriptions = await subscriptionRecords.list(this.db);
		const subscription = subscriptions[0];

		if (!subscription)
			throw new Error("No subscription found in storage.");

		try {
			console.log("Sending notification to:", subscription.endpoint);
			console.log("Using GCM API Key:", this.gcmApiKey);
			console.log("Auth Key:", subscription.keys_auth);
			console.log("P256DH Key:", subscription.keys_p256dh);
			console.log("Vapid Key:", this.localEnv.VAPID_PUBLIC_KEY);
			console.log("Vapid Private Key:", this.localEnv.VAPID_PRIVATE_KEY);

			if (!this.localEnv.VAPID_PRIVATE_KEY) {
				throw new Error("Missing VAPID_PRIVATE_KEY");
			}

			if (!this.localEnv.GCM_APIKey) {
				throw new Error("Missing GCM_APIKey");
			}

			const options: RequestOptions = {
				//TTL: 60,
				urgency: "normal",
				vapidDetails: {
					subject: "mailto: <matthew@mercuryit.co.uk>",
					publicKey: this.localEnv.VAPID_PUBLIC_KEY,
					privateKey: this.localEnv.VAPID_PRIVATE_KEY
				},
				gcmAPIKey: this.gcmApiKey
			};

			//parse the host from the endpoint
			const endpointUrl = new URL(subscription.endpoint);
			const host = endpointUrl.host;

			const pushSubscription: PushSubscription = {
				endpoint: subscription.endpoint,
				keys: {
					p256dh: subscription.keys_p256dh,
					auth: subscription.keys_auth
				}
			};

			const result = await sendNotification(pushSubscription, "Hello from Cloudflare Workers!", options);

			console.log("Notification sent: ", result.statusCode, result.body);

			var debugUrl = subscription.endpoint.replace(host, this.localEnv.DEBUG_URL);

			// const debugSubscription: PushSubscription = {
			// 	endpoint: debugUrl,
			// 	keys: {
			// 		p256dh: subscription.keys_p256dh,
			// 		auth: subscription.keys_auth
			// 	}
			// };

			// const debugResult = await sendNotification(debugSubscription, "Hello from Cloudflare Workers!", options);

			// console.log("Debug notification sent: ", debugResult.statusCode, debugResult.body);

			// Success: cleanup
			await this.ctx.storage.deleteAlarm();
			await this.ctx.storage.deleteAll();
		} catch (err: unknown) {
			const anyErr = err as WebPushError;
			console.error("Failed to send notification:", anyErr);
			console.error("Status code:", anyErr.statusCode);
			console.error("Body:", anyErr.body);
			console.error("Headers:", anyErr.headers);
			console.error("Endpoint:", anyErr.endpoint);

			// web-push returns a WebPushError with statusCode (410/404 => gone/invalid)
			// const status = anyErr?.statusCode as number | undefined;
			// if (status === 410 || status === 404) {
			// 	// Subscription is invalid/expired; remove and stop retrying
			// 	await this.ctx.storage.deleteAll();
			// 	await this.ctx.storage.deleteAlarm();
			// } else {
			// 	// Transient error: backoff and retry later (adjust delay as needed)
			// 	await this.ctx.storage.setAlarm(Date.now() + 5 * 60 * 1000);
			// }
		}
	}
}
