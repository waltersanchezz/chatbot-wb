import type { ConversationContext } from '../../domain/entities/Conversation';
import type { BatteryPreference, BearingPosition, TransmissionType } from '../../shared/types';
import { matchesBatteryIntent, matchesBearingIntent } from './IntentDetector';

const YEAR = /\b(19|20)\d{2}\b/;
const BEARING_REF = /\b(62\d{2}(?:-2RS|-ZZ)?|63\d{2}(?:-2RS|-ZZ)?)\b/i;

/**
 * Extrae datos del mensaje sin volver a pedir lo que ya está en contexto.
 */
export class ContextExtractor {
  apply(context: ConversationContext, message: string): ConversationContext {
    const next: ConversationContext = {
      ...context,
      vehicle: { ...context.vehicle },
      battery: { ...context.battery },
      bearing: { ...context.bearing },
      notes: [...context.notes],
      recommendedProductIds: [...context.recommendedProductIds],
    };

    const text = message.trim();
    const lower = text.toLowerCase();
    // Campo que el flujo estaba pidiendo antes de este mensaje.
    const expectedVehicleField =
      context.category === 'baterias'
        ? this.firstMissingBatteryVehicleField(context.vehicle)
        : context.category === 'rodamientos'
          ? this.firstMissingBearingVehicleField(context.vehicle)
          : this.firstMissingVehicleField(context.vehicle);

    const expectedBearingField =
      context.category === 'rodamientos' ? this.firstMissingBearingDetail(context) : null;

    if (!next.vehicle.year) {
      const yearMatch = text.match(YEAR);
      if (yearMatch) next.vehicle.year = yearMatch[0];
    }

    if (!next.vehicle.brand) {
      const brand = this.extractBrand(lower);
      if (brand) next.vehicle.brand = brand;
    }

    if (!next.vehicle.model) {
      const model = this.extractModel(text, next.vehicle.brand);
      if (model) next.vehicle.model = model;
    }

    if (context.category !== 'baterias' && context.category !== 'rodamientos' && !next.vehicle.engine) {
      const engine = this.extractEngine(lower);
      if (engine) next.vehicle.engine = engine;
    }

    // Slot-filling: si el extractor estructurado no capturó el campo pedido,
    // usa la respuesta libre del usuario (vehículo completo o modelo).
    this.fillExpectedVehicleSlot(next, text, lower, expectedVehicleField);

    // Baterías — no aplicar Sí/No aquí durante flujo de rodamientos.
    if (context.category !== 'rodamientos' && next.battery.soundSystem === undefined) {
      const sound = this.extractSoundSystemAnswer(lower);
      if (sound !== undefined) next.battery.soundSystem = sound;
    }

    if (next.battery.europeanCase === undefined && /\b(caja europea|europea)\b/i.test(text)) {
      next.battery.europeanCase = true;
      next.battery.standardCase = false;
    }

    if (next.battery.standardCase === undefined && /\b(caja est[aá]ndar|estandar|estándar)\b/i.test(text)) {
      next.battery.standardCase = true;
      next.battery.europeanCase = false;
    }

    if (!next.battery.preference) {
      const pref = this.extractBatteryPreference(lower);
      if (pref) next.battery.preference = pref;
    }

    // Rodamientos
    if (!next.bearing.position) {
      const pos = this.extractBearingPosition(lower);
      if (pos) next.bearing.position = pos;
    }

    if (next.bearing.hasAbs === undefined) {
      const abs = this.extractAbsAnswer(lower, expectedBearingField === 'abs');
      if (abs !== undefined) next.bearing.hasAbs = abs;
    }

    if (!next.bearing.transmission || next.bearing.transmission === 'desconocido') {
      const tr = this.extractTransmission(lower);
      if (tr) next.bearing.transmission = tr;
    }

    if (!next.bearing.referenceHint) {
      const ref = text.match(BEARING_REF);
      if (ref) next.bearing.referenceHint = ref[1].toUpperCase();
    }

    return next;
  }

  private extractBrand(lower: string): string | undefined {
    const brands = [
      'chevrolet',
      'renault',
      'mazda',
      'toyota',
      'nissan',
      'kia',
      'hyundai',
      'ford',
      'volkswagen',
      'vw',
      'suzuki',
      'honda',
      'mitsubishi',
      'bmw',
      'mercedes',
      'audi',
      'jeep',
      'dodge',
      'fiat',
      'peugeot',
      'citroen',
      'ssangyong',
      'chery',
      'dfsk',
      'jac',
    ];
    return brands.find((b) => lower.includes(b));
  }

  private extractModel(text: string, brand?: string): string | undefined {
    const models = [
      'spark',
      'sail',
      'aveo',
      'tracker',
      'duster',
      'sandero',
      'logan',
      'kwid',
      'picanto',
      'rio',
      'sportage',
      'accent',
      'tucson',
      'corolla',
      'prado',
      'hilux',
      'march',
      'versa',
      'sentra',
      'frontier',
      'ranger',
      'fiesta',
      'swift',
      'vitara',
      'civic',
      'crv',
      'gol',
      'jetta',
      'polo',
      'onix',
      'captiva',
      'tucson',
      'twingo',
      'clio',
      'symbol',
      'stepway',
      'picanto',
      'mazda 3',
      'mazda3',
    ];
    const lower = text.toLowerCase();
    const found = models.find((m) => lower.includes(m));
    if (found) return found;
    if (brand) {
      const afterBrand = new RegExp(`${brand}\\s+([a-z0-9\\-]+)`, 'i').exec(text);
      if (afterBrand?.[1] && !/^\d{4}$/.test(afterBrand[1])) return afterBrand[1];
    }
    return undefined;
  }

  private firstMissingVehicleField(
    vehicle: ConversationContext['vehicle'],
  ): 'brand' | 'model' | 'year' | 'engine' | 'vehicle' | null {
    if (!vehicle.brand) return 'brand';
    if (!vehicle.model) return 'model';
    if (!vehicle.year) return 'year';
    if (!vehicle.engine) return 'engine';
    return null;
  }

  /** Flujo de baterías: marca + modelo + año (sin motor separado). */
  private firstMissingBatteryVehicleField(
    vehicle: ConversationContext['vehicle'],
  ): 'vehicle' | 'brand' | 'model' | 'year' | null {
    if (!vehicle.brand && !vehicle.model) return 'vehicle';
    if (!vehicle.brand) return 'brand';
    if (!vehicle.model) return 'model';
    if (!vehicle.year) return 'year';
    return null;
  }

  /** Flujo de rodamientos: no exige motor para avanzar. */
  private firstMissingBearingVehicleField(
    vehicle: ConversationContext['vehicle'],
  ): 'brand' | 'model' | 'year' | null {
    if (!vehicle.brand) return 'brand';
    if (!vehicle.model) return 'model';
    if (!vehicle.year) return 'year';
    return null;
  }

  private firstMissingBearingDetail(
    context: ConversationContext,
  ): 'position' | 'abs' | null {
    if (!context.bearing.position || context.bearing.position === 'desconocido') {
      return 'position';
    }
    if (context.bearing.hasAbs === undefined) return 'abs';
    return null;
  }

  /**
   * ABS: acepta "Sí"/"No" cuando esa es la pregunta actual,
   * además de frases explícitas ("tiene ABS", "sin ABS").
   */
  private extractAbsAnswer(lower: string, expectingAbs: boolean): boolean | undefined {
    const normalized = lower
      .replace(/[✅❌]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (
      /\b(sin abs|no tiene abs|abs no|no trae abs)\b/i.test(normalized) ||
      (expectingAbs && /^(no|nop|nel)\b/i.test(normalized))
    ) {
      return false;
    }

    if (
      /\b(con abs|tiene abs|abs s[ií]|trae abs)\b/i.test(normalized) ||
      (expectingAbs && /^(s[ií]|sip|claro|afirmativo)\b/i.test(normalized))
    ) {
      return true;
    }

    return undefined;
  }

  /**
   * Cuando el flujo pidió un dato del vehículo y el usuario responde en texto libre,
   * guarda ese valor solo en el campo esperado (evita bucles en modelo).
   */
  private fillExpectedVehicleSlot(
    ctx: ConversationContext,
    text: string,
    lower: string,
    expected: 'brand' | 'model' | 'year' | 'engine' | 'vehicle' | null,
  ): void {
    if (!expected) return;

    const cleaned = text
      .replace(/^[¡!¿?.,;:\-\s]+|[¡!¿?.,;:\-\s]+$/g, '')
      .replace(/^(el|la|un|una|mi|del?|es|modelo|marca|a[nñ]o|motor|tengo|es un|es una)\s+/i, '')
      .trim();

    if (!cleaned || cleaned.length > 48) return;
    if (expected !== 'year' && this.looksLikeNonVehicleAnswer(lower)) return;

    if (expected === 'vehicle' && !ctx.vehicle.brand && !ctx.vehicle.model) {
      if (YEAR.test(cleaned) || this.extractSoundSystemAnswer(lower) !== undefined) return;
      if (!this.looksLikeNameToken(cleaned)) return;

      const brand = this.extractBrand(lower);
      if (brand) {
        ctx.vehicle.brand = brand;
        const model =
          this.extractModel(text, brand) ??
          cleaned
            .replace(new RegExp(brand, 'i'), '')
            .trim()
            .replace(/^[\s\-–,]+/, '');
        if (model) ctx.vehicle.model = model;
      } else {
        // Texto libre completo (ej. "Renault Clio") como descripción del vehículo.
        ctx.vehicle.brand = cleaned;
      }
      return;
    }

    if (expected === 'brand' && !ctx.vehicle.brand && this.looksLikeNameToken(cleaned)) {
      ctx.vehicle.brand = cleaned;
      return;
    }

    if (expected === 'model' && !ctx.vehicle.model) {
      if (
        !YEAR.test(cleaned) &&
        !this.extractEngine(lower) &&
        this.looksLikeNameToken(cleaned) &&
        cleaned.toLowerCase() !== ctx.vehicle.brand?.toLowerCase()
      ) {
        ctx.vehicle.model = cleaned;
      }
      return;
    }

    if (expected === 'year' && !ctx.vehicle.year) {
      const yearMatch = cleaned.match(YEAR);
      if (yearMatch) ctx.vehicle.year = yearMatch[0];
      return;
    }

    if (expected === 'engine' && !ctx.vehicle.engine) {
      const engine = this.extractEngine(lower);
      if (engine) {
        ctx.vehicle.engine = engine;
      } else if (this.looksLikeNameToken(cleaned) && !YEAR.test(cleaned)) {
        ctx.vehicle.engine = cleaned;
      }
    }
  }

  private extractSoundSystemAnswer(lower: string): boolean | undefined {
    const normalized = lower.trim();

    // Negaciones primero (incluye frases con "amplificador").
    if (
      /^(no|nop|nel)\b/i.test(normalized) ||
      /\b(no tiene|no tengo|sin planta|no cuenta|no trae|no posee|sin amplificador|no amplificador)\b/i.test(
        normalized,
      )
    ) {
      return false;
    }

    if (
      /^(s[ií]|sip|claro|afirmativo)\b/i.test(normalized) ||
      /\b(con planta|tiene planta|planta de sonido|tiene amplificador|con amplificador)\b/i.test(
        normalized,
      )
    ) {
      return true;
    }

    return undefined;
  }

  private looksLikeNameToken(value: string): boolean {
    return /^[\p{L}\p{N}][\p{L}\p{N}\s.\-/]{0,46}$/u.test(value);
  }

  private looksLikeNonVehicleAnswer(lower: string): boolean {
    // "Baterías" / "Rodamientos" son selección de categoría, NUNCA el vehículo.
    if (matchesBatteryIntent(lower) || matchesBearingIntent(lower)) return true;

    return (
      /\b(planta de sonido|caja europea|caja est[aá]ndar|econ[oó]mica|premium|asesor|hola)\b/i.test(
        lower,
      ) ||
      /^(s[ií]|no|ok|listo|gracias)$/i.test(lower.trim())
    );
  }

  private extractEngine(lower: string): string | undefined {
    const match = lower.match(/\b(\d\.\d)\s*(l|litros?)?\b/);
    if (match) return `${match[1]}L`;
    if (lower.includes('diesel') || lower.includes('diésel')) return 'diesel';
    if (lower.includes('gasolina')) return 'gasolina';
    return undefined;
  }

  private extractBatteryPreference(lower: string): BatteryPreference | undefined {
    if (/\b(econ[oó]mica|barata|econ[oó]mico)\b/.test(lower)) return 'economica';
    if (/\b(premium|mejor|agm|efb|alta gama)\b/.test(lower)) return 'premium';
    return undefined;
  }

  private extractBearingPosition(lower: string): BearingPosition | undefined {
    if (lower.includes('delantero izquierdo') || lower.includes('delantera izquierda')) {
      return 'delantero_izquierdo';
    }
    if (lower.includes('delantero derecho') || lower.includes('delantera derecha')) {
      return 'delantero_derecho';
    }
    if (lower.includes('trasero izquierdo') || lower.includes('trasera izquierda')) {
      return 'trasero_izquierdo';
    }
    if (lower.includes('trasero derecho') || lower.includes('trasera derecha')) {
      return 'trasero_derecho';
    }
    if (lower.includes('delantero') || lower.includes('delantera')) return 'delantero';
    if (lower.includes('trasero') || lower.includes('trasera')) return 'trasero';
    if (lower.includes('izquierdo') || lower.includes('izquierda')) return 'izquierdo';
    if (lower.includes('derecho') || lower.includes('derecha')) return 'derecho';
    return undefined;
  }

  private extractTransmission(lower: string): TransmissionType | undefined {
    if (/\b(manual|mec[aá]nica)\b/.test(lower)) return 'manual';
    if (/\b(autom[aá]tic[oa]|cvt)\b/.test(lower)) return 'automatico';
    return undefined;
  }
}
