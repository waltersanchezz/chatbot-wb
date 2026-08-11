import type { ConversationIntent } from '../../shared/types';

const GREETING =
  /^(hola|buenas|buenos d[ií]as|buenas tardes|buenas noches|hey|hi|hello|qu[eé] tal|saludos)\b/i;

const HANDOFF =
  /\b(asesor|humano|persona|agente|llamar|llamada|whatsapp con alguien|hablar con)\b/i;

const OTHER =
  /\b(grasa|grasas|lubricante|lubricantes|soporte|soportes|transmisi[oó]n|accesorio)\b/i;

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[🔋⚙️]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Solo la categoría, sin vehículo ni más texto: "bateria" / "batería" / "baterias". */
export function isBareBatteryIntent(message: string): boolean {
  const text = normalize(message);
  return /^(baterias?|bateria)$/i.test(text);
}

/** Solo la categoría, sin más texto: "rodamiento(s)" / "balero(s)". */
export function isBareBearingIntent(message: string): boolean {
  const text = normalize(message);
  return /^(rodamientos?|baleros?)$/i.test(text);
}

/** Expresiones que activan el flujo de baterías. */
export function matchesBatteryIntent(message: string): boolean {
  const text = normalize(message);
  if (!text) return false;

  if (
    /^(baterias?|bateria)$/i.test(text) ||
    text === 'baterias' ||
    text === 'bateria'
  ) {
    return true;
  }

  return (
    /\bbaterias?\b/.test(text) ||
    /\bquiero una bateria\b/.test(text) ||
    /\bnecesito una bateria\b/.test(text) ||
    /\bbusco una bateria\b/.test(text) ||
    /\bnecesito cambiar (la |una )?bateria\b/.test(text) ||
    /\bmi carro no prende\b/.test(text) ||
    /\bbateria para mi carro\b/.test(text) ||
    /\bbusco bateria\b/.test(text) ||
    /\b(cambiar|cambio|danada|dañada|agotada|muerta) (la )?bateria\b/.test(text)
  );
}

/** Expresiones que activan el flujo de rodamientos. */
export function matchesBearingIntent(message: string): boolean {
  const text = normalize(message);
  if (!text) return false;

  if (/^(rodamientos?|baleros?)$/i.test(text)) {
    return true;
  }

  return (
    /\brodamientos?\b/.test(text) ||
    /\bbaleros?\b/.test(text) ||
    /\bquiero un rodamiento\b/.test(text) ||
    /\bnecesito un rodamiento\b/.test(text) ||
    /\bbusco un rodamiento\b/.test(text) ||
    /\bnecesito cambiar (el |un )?rodamiento\b/.test(text) ||
    /\bbusco rodamiento\b/.test(text) ||
    /\brodamiento para (mi )?(carro|vehiculo|auto)\b/.test(text) ||
    /\b(620\d|630\d)(-2rs|-zz)?\b/.test(text)
  );
}

export class IntentDetector {
  detect(message: string, previousIntent?: ConversationIntent): ConversationIntent {
    const text = message.trim();

    if (HANDOFF.test(text) && text.length < 160) return 'handoff';
    if (matchesBatteryIntent(text)) return 'baterias';
    if (matchesBearingIntent(text)) return 'rodamientos';
    if (OTHER.test(text)) return 'otro_producto';

    // "Sí" / "No" y años cortos deben conservar la intención previa del flujo.
    if (previousIntent && previousIntent !== 'unknown' && previousIntent !== 'greeting') {
      if (/^(s[ií]|sip|no|nop)$/i.test(text) || /^(19|20)\d{2}$/.test(text)) {
        return previousIntent;
      }
    }

    if (GREETING.test(text)) return 'greeting';
    if (text.length < 3) return 'greeting';

    if (previousIntent && previousIntent !== 'unknown' && previousIntent !== 'greeting') {
      return previousIntent;
    }

    return 'unknown';
  }
}
