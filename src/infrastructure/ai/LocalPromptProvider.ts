import type { AiProvider } from '../../domain/copilot/AiProvider';
import type {
  CopilotGeneratedResponse,
  CopilotIntent,
} from '../../domain/dashboard/copilotDto';
import type { TemplatePayload } from '../../domain/dashboard/templateDto';

interface IndustryBlueprint {
  intent: CopilotIntent;
  industry: string;
  marketplaceTemplateId: string;
  category: string;
  companyName: string;
  businessType: string;
  welcome: string;
  color: string;
  knowledgeTitles: [string, string];
  automationName: string;
  workflowName: string;
  pipelineStages: string[];
  widgetTitle: string;
}

const BLUEPRINTS: IndustryBlueprint[] = [
  {
    intent: 'taller',
    industry: 'Taller automotriz',
    marketplaceTemplateId: 'tpl-automotriz-basico',
    category: 'Automotriz',
    companyName: 'Taller Copilot',
    businessType: 'Taller automotriz',
    welcome: '¡Hola! Bienvenido al taller. ¿En qué te ayudamos hoy?',
    color: '#1e40af',
    knowledgeTitles: ['Horarios del taller', 'Servicios disponibles'],
    automationName: 'Lead taller → seguimiento',
    workflowName: 'Flujo atención taller',
    pipelineStages: ['Consulta', 'Diagnóstico', 'Cotización', 'Reparación', 'Entrega'],
    widgetTitle: 'Citas del taller',
  },
  {
    intent: 'veterinaria',
    industry: 'Veterinaria',
    marketplaceTemplateId: 'tpl-veterinaria',
    category: 'Veterinaria',
    companyName: 'Clínica Vet Copilot',
    businessType: 'Veterinaria',
    welcome: '¡Hola! Cuidamos a tu mascota. ¿Cómo podemos ayudarte?',
    color: '#047857',
    knowledgeTitles: ['Vacunas y chequeos', 'Emergencias'],
    automationName: 'Cita vet → recordatorio',
    workflowName: 'Flujo consulta veterinaria',
    pipelineStages: ['Consulta', 'Diagnóstico', 'Tratamiento', 'Seguimiento'],
    widgetTitle: 'Agenda veterinaria',
  },
  {
    intent: 'inmobiliaria',
    industry: 'Inmobiliaria',
    marketplaceTemplateId: 'tpl-inmobiliaria',
    category: 'Inmobiliaria',
    companyName: 'Inmobiliaria Copilot',
    businessType: 'Inmobiliaria',
    welcome: '¡Hola! Encuentra tu próximo hogar con nosotros.',
    color: '#7c2d12',
    knowledgeTitles: ['Propiedades disponibles', 'Proceso de arriendo'],
    automationName: 'Lead inmueble → calificación',
    workflowName: 'Flujo lead inmobiliario',
    pipelineStages: ['Lead', 'Visita', 'Negociación', 'Cierre'],
    widgetTitle: 'Propiedades activas',
  },
  {
    intent: 'restaurante',
    industry: 'Restaurante',
    marketplaceTemplateId: 'tpl-restaurante',
    category: 'Restaurante',
    companyName: 'Restaurante Copilot',
    businessType: 'Restaurante',
    welcome: '¡Bienvenido! ¿Reservas, menú o delivery?',
    color: '#b45309',
    knowledgeTitles: ['Horario y ubicación', 'Menú del día'],
    automationName: 'Reserva → confirmación',
    workflowName: 'Flujo reservas restaurante',
    pipelineStages: ['Consulta', 'Reserva', 'Confirmada', 'Atendida'],
    widgetTitle: 'Reservas de hoy',
  },
  {
    intent: 'ferreteria',
    industry: 'Ferretería',
    marketplaceTemplateId: 'tpl-ferreteria',
    category: 'Ferretería',
    companyName: 'Ferretería Copilot',
    businessType: 'Ferretería',
    welcome: '¡Hola! Encuentra herramientas y materiales aquí.',
    color: '#374151',
    knowledgeTitles: ['Horarios de tienda', 'Entregas y pedidos'],
    automationName: 'Pedido ferretería → alerta stock',
    workflowName: 'Flujo pedidos ferretería',
    pipelineStages: ['Consulta', 'Cotización', 'Pedido', 'Entrega'],
    widgetTitle: 'Pedidos pendientes',
  },
  {
    intent: 'personalizada',
    industry: 'Empresa personalizada',
    marketplaceTemplateId: 'tpl-generico',
    category: 'Genérico',
    companyName: 'Empresa Copilot',
    businessType: 'Servicios',
    welcome: '¡Hola! Gracias por contactarnos. ¿En qué te ayudamos?',
    color: '#0f766e',
    knowledgeTitles: ['Preguntas frecuentes', 'Horario de atención'],
    automationName: 'Lead genérico → seguimiento',
    workflowName: 'Flujo atención general',
    pipelineStages: ['Nuevo', 'En proceso', 'Cerrado'],
    widgetTitle: 'Resumen operativo',
  },
];

/**
 * Proveedor local simulado: respuestas estructuradas por intención.
 * Reemplazable por OpenAI/Azure/Anthropic/Gemini sin tocar CopilotService.
 */
export class LocalPromptProvider implements AiProvider {
  async generate(prompt: string): Promise<CopilotGeneratedResponse> {
    const blueprint = detectBlueprint(prompt);
    const payload = buildPayload(blueprint, prompt);
    return {
      intent: blueprint.intent,
      industry: blueprint.industry,
      summary: `Configuración sugerida para ${blueprint.industry} a partir de: "${prompt.trim().slice(0, 120)}"`,
      payload,
      suggestedMarketplaceTemplateId: blueprint.marketplaceTemplateId,
      marketplaceTemplate: {
        name: `${blueprint.industry} (Copilot)`,
        category: blueprint.category,
        description: `Generado por AI Copilot · ${blueprint.industry}`,
      },
    };
  }
}

function detectBlueprint(prompt: string): IndustryBlueprint {
  const text = prompt.toLowerCase();
  const rules: Array<{ intent: CopilotIntent; patterns: RegExp[] }> = [
    { intent: 'taller', patterns: [/taller/, /automotriz/, /mec[aá]nic/] },
    { intent: 'veterinaria', patterns: [/veterinar/, /mascota/, /pet\b/] },
    { intent: 'inmobiliaria', patterns: [/inmobil/, /propiedad/, /arriendo/, /bienes\s*ra[ií]ces/] },
    { intent: 'restaurante', patterns: [/restaurante/, /comida/, /menu|menú/, /reserva/] },
    { intent: 'ferreteria', patterns: [/ferreter/, /herramienta/, /construcción|construccion/] },
    { intent: 'personalizada', patterns: [/personalizad/, /empresa/, /negocio/, /crear\s+una?\s/] },
  ];

  for (const rule of rules) {
    if (rule.patterns.some((re) => re.test(text))) {
      return BLUEPRINTS.find((b) => b.intent === rule.intent)!;
    }
  }
  return BLUEPRINTS.find((b) => b.intent === 'personalizada')!;
}

function buildPayload(
  bp: IndustryBlueprint,
  prompt: string,
): TemplatePayload {
  const tag = `copilot:${bp.intent}`;
  return {
    company: {
      companyName: bp.companyName,
      businessType: bp.businessType,
      welcomeMessage: bp.welcome,
      workingHours: 'Lun–Sáb 8:00–18:00',
      primaryColor: bp.color,
      secondaryColor: '#f8fafc',
      city: 'Bogotá',
      country: 'Colombia',
    },
    knowledge: [
      {
        category: 'FAQ',
        title: bp.knowledgeTitles[0],
        question: `¿Cuál es la información de ${bp.knowledgeTitles[0].toLowerCase()}?`,
        answer: `Información generada por Copilot para ${bp.industry}. Prompt: ${prompt.trim().slice(0, 80)}`,
        tags: [tag, 'copilot'],
        priority: 10,
      },
      {
        category: 'FAQ',
        title: bp.knowledgeTitles[1],
        question: `¿Qué cubre ${bp.knowledgeTitles[1].toLowerCase()}?`,
        answer: `Detalle orientativo de ${bp.industry} generado automáticamente.`,
        tags: [tag, 'copilot'],
        priority: 8,
      },
    ],
    automations: [
      {
        name: bp.automationName,
        trigger: 'conversation.created',
        enabled: true,
        priority: 5,
        condition: null,
        action: {
          type: 'create_task',
          label: `Seguimiento ${bp.industry}`,
          priority: 'Media',
          tag,
        },
        config: { source: 'copilot', intent: bp.intent },
      },
    ],
    workflows: [
      {
        name: bp.workflowName,
        description: `Workflow generado por Copilot (${bp.industry})`,
        trigger: 'conversation.created',
        enabled: true,
        graph: {
          edges: [
            { id: 'e1', source: 'start', target: 'auto1' },
            { id: 'e2', source: 'auto1', target: 'end' },
          ],
        },
        steps: [
          {
            nodeId: 'start',
            type: 'trigger',
            config: { event: 'conversation.created' },
            positionX: 0,
            positionY: 0,
          },
          {
            nodeId: 'auto1',
            type: 'automation',
            config: { label: bp.automationName },
            positionX: 200,
            positionY: 0,
          },
          {
            nodeId: 'end',
            type: 'end',
            config: {},
            positionX: 400,
            positionY: 0,
          },
        ],
      },
    ],
    pipeline: {
      stages: bp.pipelineStages,
      notes: `Pipeline ${bp.industry} (declarativo)`,
    },
    tasks: [
      {
        title: `Revisar configuración ${bp.industry}`,
        priority: 'Media',
        notes: 'Creado por AI Copilot',
      },
    ],
    widgets: [
      {
        id: `widget-${bp.intent}`,
        title: bp.widgetTitle,
        type: 'summary',
      },
    ],
  };
}
