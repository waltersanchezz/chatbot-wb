import type { ConversationContext } from '../../domain/entities/Conversation';
import type { Product } from '../../domain/entities/Product';
import type { FlowReply } from './batteryFlow';

function missingVehicleFields(ctx: ConversationContext): string[] {
  const missing: string[] = [];
  if (!ctx.vehicle.brand) missing.push('marca del vehículo');
  if (!ctx.vehicle.model) missing.push('modelo');
  if (!ctx.vehicle.year) missing.push('año');
  return missing;
}

function missingBearingFields(ctx: ConversationContext): string[] {
  const missing: string[] = [];
  if (!ctx.bearing.position || ctx.bearing.position === 'desconocido') {
    missing.push('posición del rodamiento');
  }
  if (ctx.bearing.hasAbs === undefined) missing.push('ABS');
  // Tras ABS se recomienda (vehículo + modelo/año + ABS). Transmisión es opcional.
  return missing;
}

function fieldPrompt(field: string): string {
  switch (field) {
    case 'marca del vehículo':
      return '🚗 ¿Cuál es la marca del vehículo?';
    case 'modelo':
      return '🚗 ¿Cuál es el modelo?';
    case 'año':
      return '📅 ¿De qué año es?';
    case 'motor':
      return '📝 ¿Cuál es el motor?';
    default:
      return `📝 ¿Cuál es ${field}?`;
  }
}

export function bearingNextQuestion(ctx: ConversationContext): FlowReply {
  // Si ya trae referencia conocida (6205, etc.), podemos saltar parte del vehículo
  if (ctx.bearing.referenceHint) {
    return { text: '', stage: 'recommending' };
  }

  const vehicleMissing = missingVehicleFields(ctx);
  if (vehicleMissing.length > 0) {
    const first = vehicleMissing[0];
    const intro =
      vehicleMissing.length === 4
        ? '⚙️ Perfecto, te ayudo con el rodamiento.\n📝 Para ubicar la referencia correcta necesito datos del vehículo.'
        : '✅ Perfecto. Continuemos con los datos del vehículo.';

    return {
      text: `${intro}\n\n${fieldPrompt(first)}`,
      stage: 'collecting_vehicle',
    };
  }

  const bearingMissing = missingBearingFields(ctx);
  if (bearingMissing.length > 0) {
    const q = bearingMissing[0];
    if (q.includes('posición')) {
      return {
        text: [
          '⚙️ ¿En qué posición va el rodamiento?',
          '',
          '• Delantero',
          '• Trasero',
          '• Izquierdo',
          '• Derecho',
        ].join('\n'),
        stage: 'collecting_product_details',
      };
    }
    if (q.includes('ABS')) {
      return {
        text: [
          '📝 ¿El vehículo tiene ABS?',
          'Responde:',
          '✅ Sí',
          '❌ No',
        ].join('\n'),
        stage: 'collecting_product_details',
      };
    }
    return {
      text: [
        '📝 ¿La caja es manual o automática?',
        'Responde:',
        '• Manual',
        '• Automática',
      ].join('\n'),
      stage: 'collecting_product_details',
    };
  }

  return { text: '', stage: 'recommending' };
}

export function formatBearingRecommendation(
  ctx: ConversationContext,
  products: Product[],
): FlowReply {
  if (ctx.bearing.referenceHint && products.length === 0) {
    return {
      text: [
        `⚙️ La referencia ${ctx.bearing.referenceHint} la vamos a verificar con un asesor.`,
        '',
        '📝 Si tienes marca, modelo y año del vehículo, también me ayudan a validar la aplicación.',
        '',
        '👨‍🔧 Un asesor confirmará equivalencia, disponibilidad y el precio actualizado para ayudarte lo antes posible.',
      ].join('\n'),
      stage: 'handoff',
      needsHandoff: true,
      handoffReason: `Verificación de referencia ${ctx.bearing.referenceHint}`,
    };
  }

  const vehicle = `${ctx.vehicle.brand ?? ''} ${ctx.vehicle.model ?? ''} ${ctx.vehicle.year ?? ''}`.trim();
  const lines: string[] = [];

  if (products.length === 0) {
    return {
      text: [
        vehicle
          ? `🚗 Con los datos de tu ${vehicle}, voy a validar la referencia exacta del rodamiento.`
          : '⚙️ Voy a validar la referencia exacta del rodamiento.',
        '',
        '👨‍🔧 Un asesor confirmará la referencia correcta, disponibilidad y el precio actualizado para ayudarte lo antes posible.',
      ].join('\n'),
      stage: 'handoff',
      needsHandoff: true,
      handoffReason: 'Confirmación de referencia de rodamiento, inventario y precio',
    };
  }

  lines.push(
    vehicle
      ? `⚙️ Para tu ${vehicle}, estas referencias encajan:`
      : '⚙️ Estas referencias encajan:',
  );
  lines.push('');

  for (const p of products.slice(0, 3)) {
    const seal = p.bearing?.sealType ? ` · sello ${p.bearing.sealType}` : '';
    const measures =
      p.bearing?.boreMm && p.bearing.odMm && p.bearing.widthMm
        ? ` · ${p.bearing.boreMm}x${p.bearing.odMm}x${p.bearing.widthMm} mm`
        : '';
    lines.push(`⚙️ ${p.sku} — ${p.name}${measures}${seal}`);
    if (p.bearing?.applications?.length) {
      lines.push(`  📝 Uso típico: ${p.bearing.applications.slice(0, 2).join(', ')}`);
    }
    if (p.bearing?.equivalences?.length) {
      lines.push(`  💬 Equivalencias: ${p.bearing.equivalences.join(', ')}`);
    }
    lines.push('');
  }

  lines.push(
    '👨‍🔧 Uno de nuestros asesores confirmará la disponibilidad y el precio actualizado para ayudarte lo antes posible.',
  );

  return {
    text: lines.join('\n').trim(),
    stage: 'closing',
    needsHandoff: true,
    handoffReason: 'Confirmación de disponibilidad y precio de rodamiento',
  };
}

export function bearingTechnicalInfo(sku: string, product?: Product): string {
  if (!product?.bearing) {
    return `⚙️ La referencia ${sku} será verificada por un asesor para confirmar medidas, sellos y aplicación.\n💬 No te doy datos técnicos dudosos.`;
  }

  const b = product.bearing;
  const parts = [`⚙️ ${product.sku}: rodamiento serie ${b.series}.`];
  if (b.boreMm && b.odMm && b.widthMm) {
    parts.push(`📝 Medidas aproximadas: ${b.boreMm} x ${b.odMm} x ${b.widthMm} mm.`);
  }
  if (b.sealType) parts.push(`📦 Tipo de sello: ${b.sealType}.`);
  if (b.lubrication) parts.push(`📝 Lubricación: ${b.lubrication}.`);
  if (b.equivalences?.length) parts.push(`💬 Equivalencias comunes: ${b.equivalences.join(', ')}.`);
  if (b.applications?.length) parts.push(`📝 Aplicaciones: ${b.applications.join(', ')}.`);
  parts.push('🚗 Si me das el vehículo, confirmo si aplica correctamente.');
  return parts.join(' ');
}
