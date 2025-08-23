import { DurableObject } from "cloudflare:workers";
import { PushSubscription, sendNotification, setVapidDetails, WebPushError, RequestOptions } from 'web-push';
import { createHash } from 'node:crypto';

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


/** A Durable Object's behavior is defined in an exported Javascript class */
export class MyDurableObject extends DurableObject {
	/**
	 * The constructor is invoked once upon creation of the Durable Object, i.e. the first call to
	 * 	`DurableObjectStub::get` for a given identifier (no-op constructors can be omitted)
	 *
	 * @param ctx - The interface for interacting with Durable Object state
	 * @param env - The interface to reference bindings declared in wrangler.jsonc
	 */
	constructor(ctx: DurableObjectState, env: Env) {
		if (!env.VAPID_PRIVATE_KEY) {
			throw new Error("Missing VAPID_PRIVATE_KEY");
		}

		setVapidDetails("https://p4nda.co.uk", env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);

		super(ctx, env);
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
		await this.ctx.storage.put("value", subscription);

		console.log("Subscription registered:", subscription.endpoint);

		let currentAlarm = await this.ctx.storage.getAlarm();
		if (currentAlarm == null || currentAlarm <= Date.now()) {
			console.log("Setting alarm for 1 minute in the future");
			await this.ctx.storage.setAlarm(Date.now() + 1000 * 60);
		}
		else {
			console.log("Alarm already set for:", new Date(currentAlarm));
		}
	}

	async alarm() {
		console.log("Alarm triggered");

		const subscription = (await this.ctx.storage.get("value")) as PushSubscription | undefined;
		if (!subscription) throw new Error("No subscription found in storage.");

		try {
			console.log("Sending notification to:", subscription.endpoint);

			const options: RequestOptions = {
				TTL: 60,
				urgency: "normal"
			};

			await sendNotification(subscription, "Hello from Cloudflare Workers!", options);

			// Success: cleanup
			await this.ctx.storage.deleteAll();
			await this.ctx.storage.deleteAlarm();
		} catch (err) {
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
