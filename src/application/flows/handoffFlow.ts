export function handoffMessage(reason?: string): string {
  const detail = reason ? `\n\n📝 Motivo: ${reason}.` : '';
  return [
    '👨‍🔧 Voy a solicitar a uno de nuestros asesores que confirme la disponibilidad y el precio actualizado para ayudarte lo antes posible.',
    detail,
    '',
    '💬 En un momento un asesor de Rodacenter Manizales continúa contigo.',
  ]
    .filter(Boolean)
    .join('\n')
    .trim();
}

/**
 * Ack corto cuando el handoff ya está activo.
 * Evita la palabra "asesor" para no re-disparar IntentDetector.HANDOFF si Meta
 * reinyecta el texto (eco / reintento).
 */
export function handoffAlreadyActiveMessage(): string {
  return '💬 Ya registramos tu solicitud. En breve Rodacenter Manizales continúa contigo.';
}

/** Detecta eco del propio mensaje de handoff (o fragmentos típicos). */
export function isOutboundHandoffEcho(text: string): boolean {
  const t = text.trim();
  if (t.length < 40) return false;
  return (
    t.includes(
      'Voy a solicitar a uno de nuestros asesores que confirme la disponibilidad',
    ) ||
    t.includes('Motivo: Cliente aceptó la recomendación Willard') ||
    (t.includes('Motivo:') &&
      t.includes('asesor de Rodacenter Manizales continúa contigo'))
  );
}

export function securityBlockedMessage(): string {
  return '💬 Puedo ayudarte con 🔋 baterías, ⚙️ rodamientos y productos de Rodacenter.\n🚗 ¿Qué necesitas para tu vehículo?';
}
