export function welcomeMessage(
  companyName: string,
  appName: string,
  customerName?: string,
): string {
  const name = customerName ? `, ${customerName}` : '';
  return [
    `👋 ¡Hola${name}! Bienvenido a ${companyName}.`,
    `🤖 Soy ${appName}, tu asesor en baterías y rodamientos.`,
    '',
    '💬 ¿En qué te puedo ayudar hoy?',
    '',
    '🔋 Baterías',
    '⚙️ Rodamientos',
    '',
    'También puedo orientarte con retenes, grasas, lubricantes y accesorios.',
  ].join('\n');
}

export function categoryPrompt(): string {
  return [
    '💬 Con gusto te ayudo.',
    '',
    '📝 ¿Buscas algo de esto?',
    '',
    '🔋 Baterías',
    '⚙️ Rodamientos',
    '',
    'Si es otro producto, cuéntame y te oriento.',
  ].join('\n');
}
