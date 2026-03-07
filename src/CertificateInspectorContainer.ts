import { Container } from "@cloudflare/containers";

type CertificateDetails = {
	host: string;
	port: number;
	authorized: boolean;
	authorizationError: string | null;
	validFrom: string | null;
	validTo: string | null;
	fingerprint: string | null;
	fingerprint256: string | null;
	serialNumber: string | null;
	subjectAltName: string | null;
	subject: Record<string, string> | null;
	issuer: Record<string, string> | null;
	chain: Array<{
		subject: Record<string, string> | null;
		issuer: Record<string, string> | null;
		validFrom: string | null;
		validTo: string | null;
		fingerprint256: string | null;
		serialNumber: string | null;
	}>;
	inspectedAt: string;
};

type StoredInspection = {
	requestedHost: string;
	requestedPort: number;
	storedAt: string;
	result: CertificateDetails;
};

function normalizeHost(host: string): string {
	return host.trim().toLowerCase();
}

export class CertificateInspectorContainer extends Container {
	defaultPort = 8080;
	sleepAfter = "5m";
	enableInternet = true;

	async inspectCertificate(host: string, port = 443): Promise<StoredInspection> {
		const normalizedHost = normalizeHost(host);
		const response = await this.containerFetch("http://container/inspect", {
			method: "POST",
			headers: {
				"content-type": "application/json",
			},
			body: JSON.stringify({ host: normalizedHost, port }),
		});

		if (!response.ok) {
			const message = await response.text();
			throw new Error(message || `Certificate inspection failed with status ${response.status}`);
		}

		const result = (await response.json()) as CertificateDetails;
		const storedInspection: StoredInspection = {
			requestedHost: normalizedHost,
			requestedPort: port,
			storedAt: new Date().toISOString(),
			result,
		};

		await this.ctx.storage.put("lastInspection", storedInspection);
		return storedInspection;
	}

	async getStoredInspection(): Promise<StoredInspection | null> {
		return (await this.ctx.storage.get<StoredInspection>("lastInspection")) ?? null;
	}
}
