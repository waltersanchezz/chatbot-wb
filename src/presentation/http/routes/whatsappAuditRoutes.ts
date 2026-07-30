import { Router } from 'express';
import { whatsappDeliveryAudit } from '../../../infrastructure/messaging/WhatsAppDeliveryAudit';

/**
 * Endpoint de evidencia para validar idempotencia WhatsApp.
 * Protegido con el mismo verify token del webhook.
 */
export function createWhatsAppAuditRouter(verifyToken: string): Router {
  const router = Router();

  router.get('/whatsapp-delivery', (req, res) => {
    const token = String(req.query.token ?? '');
    if (!verifyToken || token !== verifyToken) {
      res.sendStatus(403);
      return;
    }
    res.json(whatsappDeliveryAudit.snapshot());
  });

  router.post('/whatsapp-delivery/reset', (req, res) => {
    const token = String(req.query.token ?? req.body?.token ?? '');
    if (!verifyToken || token !== verifyToken) {
      res.sendStatus(403);
      return;
    }
    whatsappDeliveryAudit.reset();
    res.json({ ok: true, snapshot: whatsappDeliveryAudit.snapshot() });
  });

  return router;
}
