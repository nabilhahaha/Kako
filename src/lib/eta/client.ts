// ── ETA API adapter (auth → submit → status) ──
// Network calls only. Every entry point throws a clear error when ETA isn't
// configured, so nothing here runs during normal builds/tests.

import { etaConfig, isEtaConfigured } from './config';
import type { EtaDocument, EtaSubmitResponse } from './types';

function ensureConfigured(): void {
  if (!isEtaConfigured()) {
    throw new Error(
      'ETA is not configured (set ETA_CLIENT_ID / ETA_CLIENT_SECRET). See docs/ETA.md.',
    );
  }
}

/** Obtain an OAuth2 client-credentials token from the ETA identity service. */
export async function getEtaToken(): Promise<string> {
  ensureConfigured();
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: etaConfig.clientId,
    client_secret: etaConfig.clientSecret,
    scope: 'InvoicingAPI',
  });
  const res = await fetch(`${etaConfig.endpoints.id}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    throw new Error(`ETA token request failed: ${res.status} ${await safeText(res)}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error('ETA token response missing access_token');
  return json.access_token;
}

/** Submit one or more SIGNED documents to ETA. */
export async function submitDocuments(
  signedDocuments: EtaDocument[],
  token?: string,
): Promise<EtaSubmitResponse> {
  ensureConfigured();
  const bearer = token ?? (await getEtaToken());
  const res = await fetch(`${etaConfig.endpoints.api}/documentsubmissions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ documents: signedDocuments }),
  });
  if (!res.ok) {
    throw new Error(`ETA submission failed: ${res.status} ${await safeText(res)}`);
  }
  return (await res.json()) as EtaSubmitResponse;
}

/** Fetch a previously-submitted document's status/details by its UUID. */
export async function getDocumentStatus(uuid: string, token?: string): Promise<unknown> {
  ensureConfigured();
  const bearer = token ?? (await getEtaToken());
  const res = await fetch(`${etaConfig.endpoints.api}/documents/${uuid}/details`, {
    headers: { Authorization: `Bearer ${bearer}` },
  });
  if (!res.ok) {
    throw new Error(`ETA status request failed: ${res.status} ${await safeText(res)}`);
  }
  return res.json();
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}
