import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verifica X-Hub-Signature-256 de Meta (HMAC-SHA256 del raw body).
 * Formato header: `sha256=<hex>`
 */
export function verifyWhatsAppSignature(
  rawBody: Buffer | string,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  const secret = appSecret?.trim();
  if (!secret) return false;
  const header = (signatureHeader ?? '').trim();
  if (!header.toLowerCase().startsWith('sha256=')) return false;
  const provided = header.slice('sha256='.length).trim();
  if (!/^[a-f0-9]{64}$/i.test(provided)) return false;

  const raw =
    typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
  const expected = createHmac('sha256', secret).update(raw).digest('hex');

  try {
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(provided, 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Firma un body para tests / herramientas. */
export function signWhatsAppBody(
  rawBody: Buffer | string,
  appSecret: string,
): string {
  const raw =
    typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
  const hex = createHmac('sha256', appSecret).update(raw).digest('hex');
  return `sha256=${hex}`;
}

/** Resumen seguro para logs (sin texto ni payload completo). */
export function summarizeWhatsAppPayload(body: unknown): {
  entryCount: number;
  textMessageCount: number;
  wamids: string[];
} {
  const root = body as {
    entry?: Array<{
      changes?: Array<{
        value?: { messages?: Array<{ id?: string; type?: string }> };
      }>;
    }>;
  } | null;
  const entries = Array.isArray(root?.entry) ? root.entry : [];
  const wamids: string[] = [];
  let textMessageCount = 0;
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      for (const msg of change.value?.messages ?? []) {
        if (msg?.type === 'text') textMessageCount += 1;
        if (msg?.id) wamids.push(msg.id);
      }
    }
  }
  return {
    entryCount: entries.length,
    textMessageCount,
    wamids: wamids.slice(0, 20),
  };
}
