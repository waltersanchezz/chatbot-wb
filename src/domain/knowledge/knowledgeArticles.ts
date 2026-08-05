/**
 * Artículos FAQ del Knowledge Engine (contenido estático, sin I/O).
 */

export interface KnowledgeArticle {
  id: string;
  title: string;
  keywords: string[];
  body: string;
}

export const KNOWLEDGE_ARTICLES: KnowledgeArticle[] = [
  {
    id: 'cca',
    title: '¿Qué significa CCA?',
    keywords: [
      'cca',
      'cold cranking',
      'amperaje de arranque',
      'corriente de arranque',
      'que significa cca',
      'qué significa cca',
    ],
    body: [
      '*CCA* significa *Cold Cranking Amps* (amperios de arranque en frío).',
      '',
      'Indica cuánta corriente puede entregar la batería a baja temperatura para arrancar el motor.',
      'A mayor CCA, más capacidad de arranque en frío o con motor exigente.',
      '',
      'En Rodacenter usamos el CCA del catálogo Willard (prueba a 18 °C / ficha técnica) como referencia técnica.',
    ].join('\n'),
  },
  {
    id: 'ah',
    title: '¿Qué significa Ah?',
    keywords: [
      'ah',
      'amperio hora',
      'amperios hora',
      'c20',
      'capacidad',
      'que significa ah',
      'qué significa ah',
    ],
    body: [
      '*Ah* significa *amperio-hora* y mide la capacidad de reserva de la batería.',
      '',
      'En el catálogo Willard suele aparecer como *C20 (Ah)*: cuánta energía puede entregar en 20 horas.',
      'Más Ah implica más autonomía para accesorios (luces, sonido, módulos) cuando el motor no carga.',
      '',
      'No sustituye al CCA: Ah = reserva; CCA = fuerza de arranque.',
    ].join('\n'),
  },
  {
    id: 'libre-mantenimiento',
    title: '¿Qué es una batería libre de mantenimiento?',
    keywords: [
      'libre mantenimiento',
      'libre de mantenimiento',
      'mantenimiento',
      'sellada',
      'no requiere agua',
    ],
    body: [
      'Una batería *libre de mantenimiento* está sellada y no requiere rellenar electrolito en uso normal.',
      '',
      'Ventajas típicas: menos intervención, menor riesgo de derrames y diseño pensado para uso diario.',
      'Igual conviene revisar bornes, estado de carga y que la referencia sea la adecuada para el vehículo.',
    ].join('\n'),
  },
  {
    id: 'bateria-menor',
    title: '¿Qué pasa si instalo una batería menor?',
    keywords: [
      'bateria menor',
      'batería menor',
      'mas pequena',
      'más pequeña',
      'menor cca',
      'menor amperaje',
      'instalo una menor',
    ],
    body: [
      'Instalar una batería *menor* (menos CCA o Ah de lo recomendado) puede causar:',
      '',
      '• Arranques difíciles, sobre todo en frío o con planta de sonido',
      '• Descargas más rápidas con accesorios encendidos',
      '• Mayor desgaste prematuro de la batería',
      '',
      'En Rodacenter recomendamos respetar la referencia del catálogo Willard para tu vehículo.',
    ].join('\n'),
  },
  {
    id: 'bateria-mayor',
    title: '¿Qué pasa si instalo una batería mayor?',
    keywords: [
      'bateria mayor',
      'batería mayor',
      'mas grande',
      'más grande',
      'mayor cca',
      'mayor amperaje',
      'instalo una mayor',
    ],
    body: [
      'Una batería *mayor* (más CCA/Ah) a veces mejora el arranque y la reserva, pero no siempre es válida:',
      '',
      '• Debe caber en la bandeja (dimensiones / tipo de caja)',
      '• Polaridad y terminal deben coincidir',
      '• El alternador debe poder recuperarla sin sobrecarga anormal',
      '',
      'Si el catálogo Willard ofrece una alternativa superior compatible, un asesor puede confirmarla.',
      'No instalamos una referencia solo por “ser más grande” sin validar caja y polaridad.',
    ].join('\n'),
  },
];

export function findKnowledgeArticle(
  topicOrQuestion: string,
  articles: KnowledgeArticle[] = KNOWLEDGE_ARTICLES,
): KnowledgeArticle | null {
  const q = normalizeFaqQuery(topicOrQuestion);
  if (!q) return null;

  let best: KnowledgeArticle | null = null;
  let bestScore = 0;

  for (const article of articles) {
    let score = 0;
    for (const keyword of article.keywords) {
      const k = normalizeFaqQuery(keyword);
      if (!k) continue;
      if (q === k || q.includes(k) || k.includes(q)) {
        score += k.length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = article;
    }
  }

  return bestScore > 0 ? best : null;
}

function normalizeFaqQuery(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[¿?¡!.,;:()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
