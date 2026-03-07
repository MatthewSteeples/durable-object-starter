import http, { type IncomingMessage, type ServerResponse } from "node:http";
import tls, { type DetailedPeerCertificate, type PeerCertificate } from "node:tls";

type NameRecord = Record<string, string>;

type SimplifiedCertificate = {
	subject: NameRecord | null;
	issuer: NameRecord | null;
	validFrom: string | null;
	validTo: string | null;
	fingerprint256: string | null;
	serialNumber: string | null;
};

type InspectionResult = {
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
	subject: NameRecord | null;
	issuer: NameRecord | null;
	chain: SimplifiedCertificate[];
	inspectedAt: string;
};

type InspectRequest = {
	host?: unknown;
	port?: unknown;
};

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
	response.writeHead(statusCode, { "content-type": "application/json" });
	response.end(JSON.stringify(payload));
}

async function readJsonBody(request: IncomingMessage): Promise<InspectRequest> {
	const chunks: Buffer[] = [];

	for await (const chunk of request) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}

	if (chunks.length === 0) {
		return {};
	}

	try {
		return JSON.parse(Buffer.concat(chunks).toString("utf8")) as InspectRequest;
	} catch {
		throw new Error("Request body must be valid JSON.");
	}
}

function sanitizeName(name: unknown): NameRecord | null {
	if (!name || typeof name !== "object") {
		return null;
	}

	return Object.fromEntries(
		Object.entries(name)
			.filter(([, value]) => typeof value === "string" && value.length > 0)
			.map(([key, value]) => [key, value])
	) as NameRecord;
}

function simplifyCertificate(certificate: PeerCertificate | DetailedPeerCertificate): SimplifiedCertificate | null {
	if (!certificate || Object.keys(certificate).length === 0) {
		return null;
	}

	return {
		subject: sanitizeName(certificate.subject),
		issuer: sanitizeName(certificate.issuer),
		validFrom: "valid_from" in certificate ? certificate.valid_from ?? null : null,
		validTo: "valid_to" in certificate ? certificate.valid_to ?? null : null,
		fingerprint256: "fingerprint256" in certificate ? certificate.fingerprint256 ?? null : null,
		serialNumber: "serialNumber" in certificate ? certificate.serialNumber ?? null : null,
	};
}

function buildCertificateChain(certificate: DetailedPeerCertificate): SimplifiedCertificate[] {
	const chain: SimplifiedCertificate[] = [];
	const seenFingerprints = new Set<string>();
	let current: DetailedPeerCertificate | PeerCertificate | undefined = certificate;

	while (current && Object.keys(current).length > 0) {
		const fallbackSubject = current.subject && typeof current.subject === "object" && "CN" in current.subject
			? String(current.subject.CN)
			: "unknown";
		const fingerprint = "fingerprint256" in current && current.fingerprint256
			? current.fingerprint256
			: `${fallbackSubject}:${chain.length}`;

		if (seenFingerprints.has(fingerprint)) {
			break;
		}

		seenFingerprints.add(fingerprint);
		const simplified = simplifyCertificate(current);
		if (!simplified) {
			break;
		}

		chain.push(simplified);

		if (!("issuerCertificate" in current) || !current.issuerCertificate || current.issuerCertificate === current) {
			break;
		}

		current = current.issuerCertificate;
	}

	return chain;
}

function inspectCertificate(host: string, targetPort: number): Promise<InspectionResult> {
	return new Promise((resolve, reject) => {
		const socket = tls.connect(
			{
				host,
				port: targetPort,
				servername: host,
				rejectUnauthorized: true,
			},
			() => {
				try {
					const certificate = socket.getPeerCertificate(true);
					resolve({
						host,
						port: targetPort,
						authorized: socket.authorized,
						authorizationError: socket.authorizationError ? String(socket.authorizationError) : null,
						validFrom: certificate.valid_from ?? null,
						validTo: certificate.valid_to ?? null,
						fingerprint: certificate.fingerprint ?? null,
						fingerprint256: certificate.fingerprint256 ?? null,
						serialNumber: certificate.serialNumber ?? null,
						subjectAltName: certificate.subjectaltname ?? null,
						subject: sanitizeName(certificate.subject),
						issuer: sanitizeName(certificate.issuer),
						chain: buildCertificateChain(certificate),
						inspectedAt: new Date().toISOString(),
					});
				} catch (error) {
					reject(error);
				} finally {
					socket.end();
				}
			}
		);

		socket.setTimeout(15000, () => {
			socket.destroy(new Error("Timed out while connecting to remote TLS endpoint."));
		});

		socket.once("error", reject);
	});
}

const listenPort = Number.parseInt(process.env.PORT ?? "8080", 10);

const server = http.createServer(async (request, response) => {
	if (request.url === "/ping") {
		response.writeHead(200, { "content-type": "text/plain" });
		response.end("ok");
		return;
	}

	if (request.method === "POST" && request.url === "/inspect") {
		try {
			const body = await readJsonBody(request);
			const host = typeof body.host === "string" ? body.host.trim() : "";
			const targetPort = typeof body.port === "number" && Number.isInteger(body.port) ? body.port : 443;

			if (!host) {
				sendJson(response, 400, { error: "The request body must include a host." });
				return;
			}

			if (targetPort < 1 || targetPort > 65535) {
				sendJson(response, 400, { error: "The requested port must be between 1 and 65535." });
				return;
			}

			const result = await inspectCertificate(host, targetPort);
			sendJson(response, 200, result);
		} catch (error) {
			sendJson(response, 502, {
				error: error instanceof Error ? error.message : String(error),
			});
		}
		return;
	}

	sendJson(response, 404, { error: "Not found" });
});

server.listen(listenPort, () => {
	console.log(`Certificate inspector listening on ${listenPort}`);
});
