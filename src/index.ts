import { DurableObject } from "cloudflare:workers";
import { PushSubscription, sendNotification, setVapidDetails, WebPushError, RequestOptions } from 'web-push';
import { createHash } from 'node:crypto';
import https from 'https';

/**
 * Welcome to Cloudflare Workers! This is your first Durable Objects application.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your Durable Object in action
 * - Run `npm run deploy` to publish your application
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/durable-objects
 */

type SubscriptionRecord = {
	endpoint: string;
	keys_p256dh: string;
	keys_auth: string;
};

/** A Durable Object's behavior is defined in an exported Javascript class */
export class MyDurableObject extends DurableObject {
	private readonly gcmApiKey: string;
	private readonly localEnv: Env;

	private readonly sql: SqlStorage;
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

		this.sql = ctx.storage.sql;

		this.ensureSchema();

		this.localEnv = env;
		this.gcmApiKey = env.GCM_APIKey;
	}

	private ensureSchema() {
		if (this.initialized) return;

		// Check existing table schema
		const info = this.sql.exec("PRAGMA table_info('subscription');").toArray();
		const existingCols: string[] = info.map((r: any) => r.name);
		const expected = ["endpoint", "keys_p256dh", "keys_auth"];

		let needsMigration = false;

		if (existingCols.length === 0) {
			// Table doesn't exist — create with expected schema
			this.sql.exec(`CREATE TABLE IF NOT EXISTS subscription(
				endpoint    TEXT PRIMARY KEY,
				keys_p256dh TEXT NOT NULL,
				keys_auth   TEXT NOT NULL
			);`);
			this.initialized = true;
			return;
		}

		// If expected columns are not all present, or endpoint isn't primary key, migrate
		for (const col of expected) {
			if (!existingCols.includes(col)) {
				needsMigration = true;
				break;
			}
		}

		if (!needsMigration) {
			// check that endpoint is primary key
			const endpointInfo = info.find((r: any) => r.name === 'endpoint');
			if (!endpointInfo || !(endpointInfo.pk && Number(endpointInfo.pk) > 0)) {
				needsMigration = true;
			}
		}

		if (!needsMigration) {
			this.initialized = true;
			return;
		}

		// Perform migration inside Durable Object storage transaction for safety
		this.ctx.storage.transactionSync(() => {
			this.sql.exec(`CREATE TABLE IF NOT EXISTS subscription_new(
				endpoint    TEXT PRIMARY KEY,
				keys_p256dh TEXT NOT NULL,
				keys_auth   TEXT NOT NULL
			);`);

			// Build SELECT list matching expected columns; use empty string when column missing
			const selectParts = expected.map(col => existingCols.includes(col) ? col : `''`);
			let insertSql: string;
			if (existingCols.includes('endpoint')) {
				insertSql = `INSERT INTO subscription_new (endpoint, keys_p256dh, keys_auth) SELECT endpoint, MAX(keys_p256dh), MAX(keys_auth) FROM subscription GROUP BY endpoint;`;
			} else {
				insertSql = `INSERT INTO subscription_new (endpoint, keys_p256dh, keys_auth) SELECT ${selectParts.join(', ')} FROM subscription;`;
			}
			this.sql.exec(insertSql);

			this.sql.exec('DROP TABLE subscription;');
			this.sql.exec("ALTER TABLE subscription_new RENAME TO subscription;");
		});

		this.initialized = true;
	}

	/**
	 * The Durable Object exposes an RPC method sayHello which will be invoked when when a Durable
	 *  Object instance receives a request from a Worker via the same method invocation on the stub
	 *
	 * @param name - The name provided to a Durable Object instance from a Worker
	 * @returns The greeting to be sent back to the Worker
	 */
	async sayHello(name: string): Promise<string> {
		return `Hello, ${name}!`;
	}

	async registerNotification(subscription: PushSubscription): Promise<void> {

		this.ctx.storage.transactionSync(() => {
			this.sql.exec("DELETE FROM subscription;");
			this.sql.exec(
				`INSERT INTO subscription (endpoint, keys_p256dh, keys_auth) VALUES (?, ?, ?);`,
				subscription.endpoint,
				subscription.keys.p256dh,
				subscription.keys.auth
			);
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
		console.log("Alarm triggered");

		const subscription = this.sql.exec<SubscriptionRecord>("SELECT * FROM subscription LIMIT 1;").one()
		if (!subscription) throw new Error("No subscription found in storage.");

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
				TTL: 60,
				urgency: "normal",
				gcmAPIKey: this.gcmApiKey,
				vapidDetails: {
					subject: "mailto:matthew@mercuryit.co.uk",
					publicKey: this.localEnv.VAPID_PUBLIC_KEY,
					privateKey: this.localEnv.VAPID_PRIVATE_KEY
				}
			};

			var pushSubscription: PushSubscription = {
				endpoint: subscription.endpoint,
				keys: {
					p256dh: subscription.keys_p256dh,
					auth: subscription.keys_auth
				}
			};

			await sendNotification(pushSubscription, "Hello from Cloudflare Workers!", options);

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

export default {
	/**
	 * This is the standard fetch handler for a Cloudflare Worker
	 *
	 * @param request - The request submitted to the Worker from the client
	 * @param env - The interface to reference bindings declared in wrangler.jsonc
	 * @param ctx - The execution context of the Worker
	 * @returns The response to be sent back to the client
	 */
	async fetch(request, env, ctx): Promise<Response> {

		// Parse the 'name' parameter from the request URL
		const url = new URL(request.url);
		const name = url.searchParams.get("name") || "world";


		const pathname = url.pathname;
		if (pathname === "/subscribe") {
			console.log("Subscribe endpoint called");

			const jsonBody = await request.json<PushSubscription>();

			const md5 = createHash('md5').update(jsonBody.endpoint, 'utf8').digest('hex');
			console.log("MD5 of endpoint:", md5);

			// Create a `DurableObjectId` for an instance of the `MyDurableObject`
			// class named "foo". Requests from all Workers to the instance named
			// "foo" will go to a single globally unique Durable Object instance.
			const id: DurableObjectId = env.MY_DURABLE_OBJECT.idFromName(md5);

			// Create a stub to open a communication channel with the Durable
			// Object instance.
			const stub = env.MY_DURABLE_OBJECT.get(id);

			await stub.registerNotification(jsonBody);
			return new Response("Subscribed (log written)");
		}
		else if (pathname === "/list") {
			console.log("List endpoint called");
			return new Response("Not implemented");
		}
		else if (pathname === "/test") {
			console.log("Test endpoint called");

			const postData = JSON.stringify({ message: "Hello from Durable Object test" });
			const qs = url.searchParams.toString();
			const path = "/ff1ab090-de9c-4338-9dd8-43d8226aaa6b" + (qs ? "?" + qs : "");

			const result = await new Promise<string>((resolve, reject) => {
				const options: https.RequestOptions = {
					hostname: "webhook.site",
					port: 443,
					path: path,
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"Content-Length": Buffer.byteLength(postData),
					},
				};

				const req = https.request(options, (res) => {
					let body = "";
					res.on("data", (chunk) => (body += chunk));
					res.on("end", () => resolve(`status=${res.statusCode}; body=${body}`));
				});

				req.on("error", (err) => reject(err));
				req.write(postData);
				req.end();
			});

			return new Response(result);
		}
		else if (pathname === "/testGet") {
			console.log("Test endpoint called");

			const qs = url.searchParams.toString();
			const path = "/ff1ab090-de9c-4338-9dd8-43d8226aaa6b" + (qs ? "?" + qs : "");

			const result = await new Promise<string>((resolve, reject) => {
				const options: https.RequestOptions = {
					hostname: "webhook.site",
					port: 443,
					path: path,
					method: "GET",
					headers: {
						"Content-Type": "application/json"
					},
				};

				const req = https.request(options, (res) => {
					let body = "";
					res.on("data", (chunk) => (body += chunk));
					res.on("end", () => resolve(`status=${res.statusCode}; body=${body}`));
				});

				req.on("error", (err) => reject(err));
				req.end();
			});

			return new Response(result);
		}
		else if (pathname === "/repro") {
			const httpsGet = (url: string): Promise<{ statusCode?: number }> => {
				return new Promise((resolve, reject) => {
					try {
						const req = https.get(url, (res) => {
							// Consume data to allow socket to close
							res.on('data', () => { });
							res.on('end', () => resolve({ statusCode: res.statusCode }));
							res.on('error', (err) => reject(err));
						});
						req.on('error', (err) => reject(err));
					} catch (err) {
						reject(err);
					}
				});
			};

			const testUrl1 = 'https://webhook.site/ff1ab090-de9c-4338-9dd8-43d8226aaa6b';
			const testUrl2 = 'https://webhook.site/ff1ab090-de9c-4338-9dd8-43d8226aaa6b?foo=bar';

			const result1 = await httpsGet(testUrl1);
			const result2 = await httpsGet(testUrl2);

			return new Response(`Request 1 status: ${result1.statusCode}, Request 2 status: ${result2.statusCode}`);
		}
		else {

			// Create a `DurableObjectId` for an instance of the `MyDurableObject`
			// class named "foo". Requests from all Workers to the instance named
			// "foo" will go to a single globally unique Durable Object instance.
			const id: DurableObjectId = env.MY_DURABLE_OBJECT.idFromName(name);

			// Create a stub to open a communication channel with the Durable
			// Object instance.
			const stub = env.MY_DURABLE_OBJECT.get(id);
			// Call the `sayHello()` RPC method on the stub to invoke the method on
			// the remote Durable Object instance
			const greeting = await stub.sayHello(name);

			return new Response(greeting);
		}
	},
} satisfies ExportedHandler<Env>;
