import { PushSubscription } from 'web-push';
import { createHash } from 'node:crypto';

import https from 'https';
import path from "node:path";

import { connect } from "node:tls";
import { CERTIFICATE_INSPECTOR_SINGLETON, normalizeCertificateTarget } from "./certificates";
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
	async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext): Promise<Response> {

		// Parse the 'name' parameter from the request URL
		const url = new URL(request.url);
		const name = url.searchParams.get("name") || "world";


		const pathname = url.pathname;
		if (pathname === "/api/certificates/inspect" && request.method === "POST") {
			const body = await request.json<{ host?: string; port?: number }>();
			const host = typeof body.host === "string" ? body.host : "";
			const port = typeof body.port === "number" && Number.isInteger(body.port) ? body.port : 443;

			if (!host.trim()) {
				return Response.json({ error: "The request body must include a host." }, { status: 400 });
			}

			if (port < 1 || port > 65535) {
				return Response.json({ error: "The requested port must be between 1 and 65535." }, { status: 400 });
			}

			const target = normalizeCertificateTarget(host, port);
			const inspectorId = env.CERTIFICATE_INSPECTOR.idFromName(CERTIFICATE_INSPECTOR_SINGLETON);
			const inspector = env.CERTIFICATE_INSPECTOR.get(inspectorId);
			const result = await inspector.inspectCertificate(target.host, target.port);
			const storeId = env.CERTIFICATE_INSPECTION_STORE.idFromName(target.key);
			const store = env.CERTIFICATE_INSPECTION_STORE.get(storeId);
			const storedInspection = await store.saveInspection(target.host, target.port, result);

			return Response.json(storedInspection);
		}
		else if (pathname === "/api/certificates/result" && request.method === "GET") {
			const host = url.searchParams.get("host") || "";
			const parsedPort = Number.parseInt(url.searchParams.get("port") || "443", 10);

			if (!host.trim()) {
				return Response.json({ error: "The host query parameter is required." }, { status: 400 });
			}

			if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
				return Response.json({ error: "The port query parameter must be between 1 and 65535." }, { status: 400 });
			}

			const target = normalizeCertificateTarget(host, parsedPort);
			const storeId = env.CERTIFICATE_INSPECTION_STORE.idFromName(target.key);
			const store = env.CERTIFICATE_INSPECTION_STORE.get(storeId);
			const result = await store.getStoredInspection();

			if (!result) {
				return Response.json({ error: "No stored inspection exists for this host and port." }, { status: 404 });
			}

			return Response.json(result);
		}
		else if (pathname === "/subscribe") {
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
} satisfies ExportedHandler<Cloudflare.Env>;

export { CertificateInspectorContainer } from "./CertificateInspectorContainer";
export { CertificateInspectionStore } from "./CertificateInspectionStore";
export { MyDurableObject } from "./MyDurableObject";
