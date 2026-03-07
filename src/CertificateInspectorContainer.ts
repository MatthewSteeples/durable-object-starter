import { Container } from "@cloudflare/containers";
import { type CertificateDetails, normalizeHost } from "./certificates";

export class CertificateInspectorContainer extends Container {
	defaultPort = 8080;
	sleepAfter = "5m";
	enableInternet = true;

	async inspectCertificate(host: string, port = 443): Promise<CertificateDetails> {
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

		return (await response.json()) as CertificateDetails;
	}
}
