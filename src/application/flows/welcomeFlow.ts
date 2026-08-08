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

/**
 * Saludo “puro” (sin datos útiles). "Hola, Mazda 3 2015" → false.
 */
export function isPureGreetingMessage(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return /^(hola|buenas|buenos\s+d[ií]as|buenas\s+tardes|buenas\s+noches|hey|hi|hello|qu[eé]\s+tal|saludos)(?:\s*[!?.…]|\s*👋)*$/i.test(
    t,
  );
}

/**
 * Ack breve mid-flow: no reenvía el prompt del paso ni avanza SalesFlow.
 * Texto fijo — no re-pega la pregunta pendiente.
 */
export function midFlowGreetingAck(_hint?: string): string {
  return '¡Hola nuevamente! 👋 Seguimos con tu recomendación.';
}

/** Pista según nextAction / stage — sin copiar el prompt largo del paso. */
export function midFlowContinueHint(params: {
  nextAction?: string;
  stage?: string;
  needsHumanHandoff?: boolean;
}): string {
  if (params.needsHumanHandoff || params.stage === 'handoff') {
    return 'En breve Rodacenter Manizales continúa contigo.';
  }
  switch (params.nextAction) {
    case 'ASK_VEHICLE':
      return 'Cuando puedas, dime el vehículo y año.';
    case 'ASK_MODEL':
      return 'Cuando puedas, dime el modelo del vehículo.';
    case 'ASK_YEAR':
      return 'Cuando puedas, dime solo el año del vehículo (4 dígitos).';
    case 'ASK_SOUND':
      return 'Cuando puedas, responde si tiene planta de sonido: *sí* o *no*.';
    case 'CONFIRM_VEHICLE':
      return 'Cuando puedas, confirma si el vehículo es correcto: *sí* o *no*.';
    case 'ASK_INTEREST_AFTER_RECOMMENDATION':
      return 'Cuando puedas, responde si te sirve la opción: *sí* o *no*.';
    default:
      return 'Cuando puedas, continúa con el dato que te pedí.';
  }
}
