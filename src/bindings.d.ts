// Local augmentation to add secret bindings that Wrangler does not type-generate
// Do NOT edit the generated `worker-configuration.d.ts`; it will be overwritten.
import type { MyDurableObject } from "./MyDurableObject";

declare namespace Cloudflare {
	interface Env {
		/** Secret: set via `wrangler secret put VAPID_PRIVATE_KEY` or Dashboard */
		VAPID_PRIVATE_KEY: string;
		GCM_APIKey: string;
	}
}

declare module "cloudflare:workers" {
  interface Env {
    MY_DURABLE_OBJECT: DurableObjectNamespace<typeof MyDurableObject>;
  }
}

// Ensure the global Env alias picks up the augmentation
interface Env extends Cloudflare.Env { }
