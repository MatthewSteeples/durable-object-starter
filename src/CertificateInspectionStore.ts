import { DurableObject } from "cloudflare:workers";

import {
	type CertificateDetails,
	type StoredInspection,
	normalizeCertificateTarget,
} from "./certificates";

const LAST_INSPECTION_STORAGE_KEY = "lastInspection";

export class CertificateInspectionStore extends DurableObject {
	async saveInspection(host: string, port: number, result: CertificateDetails): Promise<StoredInspection> {
		const target = normalizeCertificateTarget(host, port);
		const storedInspection: StoredInspection = {
			requestedHost: target.host,
			requestedPort: target.port,
			storedAt: new Date().toISOString(),
			result,
		};

		await this.ctx.storage.put(LAST_INSPECTION_STORAGE_KEY, storedInspection);
		return storedInspection;
	}

	async getStoredInspection(): Promise<StoredInspection | null> {
		return (await this.ctx.storage.get<StoredInspection>(LAST_INSPECTION_STORAGE_KEY)) ?? null;
	}
}