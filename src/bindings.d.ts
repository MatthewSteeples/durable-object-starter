// Local augmentation to add secret bindings that Wrangler does not type-generate
// Do NOT edit the generated `worker-configuration.d.ts`; it will be overwritten.

declare namespace Cloudflare {
	interface Env {
		/** Secret: set via `wrangler secret put VAPID_PRIVATE_KEY` or Dashboard */
		VAPID_PRIVATE_KEY: string;
		GCM_APIKey: string;
	}
}

// Ensure the global Env alias picks up the augmentation
interface Env extends Cloudflare.Env { }
