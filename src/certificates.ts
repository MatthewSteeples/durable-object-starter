export type CertificateDetails = {
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

export type StoredInspection = {
	requestedHost: string;
	requestedPort: number;
	storedAt: string;
	result: CertificateDetails;
};

export const CERTIFICATE_INSPECTOR_SINGLETON = "global-certificate-inspector";

export function normalizeHost(host: string): string {
	return host.trim().toLowerCase();
}

export function normalizeCertificateTarget(host: string, port = 443): { host: string; port: number; key: string } {
	const normalizedHost = normalizeHost(host);
	return {
		host: normalizedHost,
		port,
		key: `${normalizedHost}:${port}`,
	};
}