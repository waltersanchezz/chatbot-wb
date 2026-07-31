import { Router } from 'express';
import { whatsappDeliveryAudit } from '../../../infrastructure/messaging/WhatsAppDeliveryAudit';

/**
 * Endpoints de evidencia WhatsApp (trazabilidad por wamid).
 * Protegidos con el mismo verify token del webhook.
 */
export function createWhatsAppAuditRouter(verifyToken: string): Router {
  const router = Router();

  function unauthorized(req: { query: Record<string, unknown>; body?: unknown }, res: {
    sendStatus: (code: number) => void;
  }): boolean {
    const bodyToken =
      req.body && typeof req.body === 'object' && req.body !== null && 'token' in req.body
        ? String((req.body as { token?: unknown }).token ?? '')
        : '';
    const token = String(req.query.token ?? bodyToken ?? '');
    if (!verifyToken || token !== verifyToken) {
      res.sendStatus(403);
      return true;
    }
    return false;
  }

  /**
   * Traza cronológica completa de UN wamid.
   * GET /api/debug/whatsapp-delivery/trace?wamid=...&token=...
   */
  router.get('/whatsapp-delivery/trace', (req, res) => {
    if (unauthorized(req, res)) return;
    const wamid = String(req.query.wamid ?? '').trim();
    if (!wamid) {
      res.status(400).json({ error: 'missing wamid query param' });
      return;
    }
    const trace = whatsappDeliveryAudit.getTrace(wamid);
    console.log(`AUDIT_INSTANCE=${trace.auditInstance}`);
    console.log(
      '[WA_TRACE][QUERY]',
      JSON.stringify({
        wamid: trace.wamid,
        auditInstance: trace.auditInstance,
        pid: trace.pid,
        postCount: trace.postCount,
        events: trace.timeline.length,
      }),
    );
    res.json(trace);
  });

  /** Snapshot agregado (compat). Preferir /trace?wamid= */
  router.get('/whatsapp-delivery', (req, res) => {
    if (unauthorized(req, res)) return;
    const snapshot = whatsappDeliveryAudit.snapshot();
    console.log(`AUDIT_INSTANCE=${snapshot.auditInstance}`);
    res.json(snapshot);
  });

  router.post('/whatsapp-delivery/reset', (req, res) => {
    if (unauthorized(req, res)) return;
    whatsappDeliveryAudit.reset();
    const snapshot = whatsappDeliveryAudit.snapshot();
    console.log(`AUDIT_INSTANCE=${snapshot.auditInstance}`);
    res.json({ ok: true, snapshot });
  });

  return router;
}
