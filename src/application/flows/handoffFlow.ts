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

export function securityBlockedMessage(): string {
  return '💬 Puedo ayudarte con 🔋 baterías, ⚙️ rodamientos y productos de Rodacenter.\n🚗 ¿Qué necesitas para tu vehículo?';
}
