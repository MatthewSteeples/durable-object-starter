import { PushSubscription } from 'web-push';
import { createHash } from 'node:crypto';

import https from 'https';
import path from "node:path";

import { connect } from "node:tls";
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
		else if (pathname === "/vapidPublicKey") {
			return new Response(env.VAPID_PUBLIC_KEY);
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

export { MyDurableObject } from "./MyDurableObject";
