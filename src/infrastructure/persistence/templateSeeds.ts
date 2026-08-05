import type { TemplatePayload } from '../../domain/dashboard/templateDto';

export interface SeedTemplate {
  id: string;
  category: string;
  name: string;
  description: string;
  thumbnail: string | null;
  version: string;
  author: string;
  payload: TemplatePayload;
}

export const SEED_TEMPLATES: SeedTemplate[] = [
  {
    id: 'tpl-automotriz-basico',
    category: 'Automotriz',
    name: 'Taller de baterías',
    description:
      'FAQ Willard, automatización de leads y workflow de seguimiento para talleres.',
    thumbnail: null,
    version: '1.0.0',
    author: 'Rodacenter',
    payload: {
      company: {
        businessType: 'Automotriz',
        welcomeMessage: '¡Hola! Te ayudamos a encontrar la batería ideal.',
        workingHours: 'Lun–Sáb 8:00–18:00',
        primaryColor: '#c45c26',
      },
      knowledge: [
        {
          category: 'FAQ',
          title: '¿Cuánto dura una batería?',
          question: '¿Cuánto dura una batería Willard?',
          answer:
            'En uso normal suele durar entre 2 y 4 años según clima y hábitos de carga.',
          tags: ['duracion', 'garantia'],
        },
        {
          category: 'Instalación',
          title: 'Instalación incluida',
          question: '¿Incluyen instalación?',
          answer: 'Sí, en sede con cita previa. Pregunta por cobertura a domicilio.',
          tags: ['instalacion'],
        },
      ],
      automations: [
        {
          name: '[Plantilla] Lead alto → notificación',
          trigger: 'lead.updated',
          condition: { field: 'leadScore', op: '>', value: 70 },
          action: {
            type: 'create_notification',
            label: 'Lead caliente — contactar',
          },
        },
      ],
      workflows: [
        {
          name: '[Plantilla] Seguimiento conversación',
          description: 'Trigger → notificación → fin',
          trigger: 'conversation.created',
          steps: [
            {
              nodeId: 't1',
              type: 'Trigger',
              config: { event: 'conversation.created' },
              positionX: 40,
              positionY: 80,
            },
            {
              nodeId: 'n1',
              type: 'Notification',
              config: { message: 'Nueva conversación de baterías' },
              positionX: 220,
              positionY: 80,
            },
            {
              nodeId: 'e1',
              type: 'End',
              config: {},
              positionX: 400,
              positionY: 80,
            },
          ],
          graph: {
            edges: [
              { id: 'e1', source: 't1', target: 'n1' },
              { id: 'e2', source: 'n1', target: 'e1' },
            ],
          },
        },
      ],
      pipeline: { stages: ['NEW', 'IDENTIFYING_VEHICLE', 'READY_FOR_ADVISOR'] },
      tasks: [{ title: 'Revisar leads del día', priority: 'Alta' }],
      widgets: [{ id: 'conv-today', title: 'Conversaciones hoy', type: 'stat' }],
    },
  },
  {
    id: 'tpl-veterinaria',
    category: 'Veterinaria',
    name: 'Clínica veterinaria',
    description: 'Mensajes de bienvenida, FAQs de citas y seguimiento de pacientes.',
    thumbnail: null,
    version: '1.0.0',
    author: 'Rodacenter',
    payload: {
      company: {
        businessType: 'Veterinaria',
        welcomeMessage: 'Bienvenido a nuestra clínica veterinaria.',
        workingHours: 'Lun–Vie 9:00–19:00',
      },
      knowledge: [
        {
          category: 'Servicios',
          title: 'Horario de urgencias',
          question: '¿Atienden urgencias?',
          answer: 'Sí, con previa llamada. Fuera de horario deriva a turno de guardia.',
          tags: ['urgencias', 'citas'],
        },
      ],
      automations: [
        {
          name: '[Plantilla] Conversación abandonada',
          trigger: 'conversation.updated',
          condition: { field: 'abandoned', value: true },
          action: { type: 'mark_followup', label: 'Recontactar dueño' },
        },
      ],
      tasks: [{ title: 'Confirmar citas del día', priority: 'Media' }],
      widgets: [{ id: 'tasks', title: 'Tareas clínicas', type: 'list' }],
    },
  },
  {
    id: 'tpl-restaurante',
    category: 'Restaurante',
    name: 'Restaurante / delivery',
    description: 'FAQs de menú, horarios y notificación de nuevos pedidos conversacionales.',
    thumbnail: null,
    version: '1.0.0',
    author: 'Rodacenter',
    payload: {
      company: {
        businessType: 'Restaurante',
        welcomeMessage: '¡Hola! ¿Deseas ver el menú o hacer un pedido?',
        workingHours: 'Mar–Dom 12:00–22:00',
      },
      knowledge: [
        {
          category: 'FAQ',
          title: 'Zonas de domicilio',
          question: '¿A qué zonas hacen domicilio?',
          answer: 'Cubrimos el área urbana principal. Confirma tu barrio al pedir.',
          tags: ['domicilio', 'menu'],
        },
      ],
      automations: [
        {
          name: '[Plantilla] Nuevo chat → etiqueta',
          trigger: 'conversation.created',
          action: { type: 'add_tag', tag: 'pedido' },
        },
      ],
      widgets: [{ id: 'pipeline', title: 'Pedidos en curso', type: 'kanban' }],
    },
  },
  {
    id: 'tpl-ferreteria',
    category: 'Ferretería',
    name: 'Ferretería comercial',
    description: 'Conocimiento de productos y automatización de stock/consulta.',
    thumbnail: null,
    version: '1.1.0',
    author: 'Rodacenter',
    payload: {
      company: {
        businessType: 'Ferretería',
        welcomeMessage: 'Consulta disponibilidad y referencias técnicas aquí.',
      },
      knowledge: [
        {
          category: 'Productos',
          title: 'Horario de despacho',
          question: '¿Hasta qué hora despachan?',
          answer: 'Despachos hasta las 5:30 p. m. en días hábiles.',
          tags: ['despacho'],
        },
      ],
      workflows: [
        {
          name: '[Plantilla] Analytics de consultas',
          trigger: 'analytics.updated',
          steps: [
            { nodeId: 't', type: 'Trigger', config: {}, positionX: 20, positionY: 40 },
            {
              nodeId: 'a',
              type: 'Analytics',
              config: { metric: 'ferreteria.query', value: 1 },
              positionX: 180,
              positionY: 40,
            },
            { nodeId: 'e', type: 'End', config: {}, positionX: 340, positionY: 40 },
          ],
          graph: {
            edges: [
              { id: '1', source: 't', target: 'a' },
              { id: '2', source: 'a', target: 'e' },
            ],
          },
        },
      ],
      tasks: [{ title: 'Revisar pedidos mayoristas', priority: 'Alta' }],
    },
  },
  {
    id: 'tpl-clinica',
    category: 'Clínica',
    name: 'Clínica médica',
    description: 'Plantilla para agenda, FAQs de servicios y seguimiento de pacientes.',
    thumbnail: null,
    version: '1.0.0',
    author: 'Rodacenter',
    payload: {
      company: {
        businessType: 'Clínica',
        welcomeMessage: 'Agenda tu cita o consulta horarios de especialidades.',
      },
      knowledge: [
        {
          category: 'Servicios',
          title: 'Preparación de cita',
          question: '¿Qué debo llevar a la cita?',
          answer: 'Documento de identidad y resultados previos si aplica.',
          tags: ['citas'],
        },
      ],
      automations: [
        {
          name: '[Plantilla] Idle → seguimiento',
          trigger: 'conversation.updated',
          condition: { field: 'idleMinutes', op: '>', value: 60 },
          action: { type: 'create_task', label: 'Llamar paciente', priority: 'Media' },
        },
      ],
    },
  },
  {
    id: 'tpl-inmobiliaria',
    category: 'Inmobiliaria',
    name: 'Inmobiliaria',
    description: 'Captura de leads inmobiliarios y FAQs de visitas.',
    thumbnail: null,
    version: '1.0.0',
    author: 'Rodacenter',
    payload: {
      company: {
        businessType: 'Inmobiliaria',
        welcomeMessage: 'Cuéntanos zona y presupuesto para recomendarte opciones.',
      },
      knowledge: [
        {
          category: 'FAQ',
          title: 'Visitas',
          question: '¿Cómo agendo una visita?',
          answer: 'Indica inmueble e interés; un asesor confirma horario.',
          tags: ['visitas'],
        },
      ],
      automations: [
        {
          name: '[Plantilla] Lead inmobiliario',
          trigger: 'lead.updated',
          condition: { field: 'leadScore', op: '>=', value: 50 },
          action: { type: 'raise_priority', priority: 'Alta' },
        },
      ],
      pipeline: { notes: 'Etapas comerciales inmobiliarias sugeridas' },
    },
  },
  {
    id: 'tpl-retail',
    category: 'Retail',
    name: 'Tienda retail',
    description: 'Promociones, horarios y widgets de ventas del día.',
    thumbnail: null,
    version: '1.0.0',
    author: 'Rodacenter',
    payload: {
      company: {
        businessType: 'Retail',
        welcomeMessage: '¿Buscas un producto o una promoción vigente?',
      },
      knowledge: [
        {
          category: 'Promociones',
          title: 'Descuentos vigentes',
          question: '¿Qué promociones hay?',
          answer: 'Consulta el catálogo del mes; aplican términos en caja.',
          tags: ['promo'],
        },
      ],
      widgets: [
        { id: 'sales', title: 'Ventas del día', type: 'stat' },
        { id: 'stock', title: 'Alertas de stock', type: 'list' },
      ],
    },
  },
  {
    id: 'tpl-generico',
    category: 'Genérico',
    name: 'Starter genérico',
    description: 'Configuración mínima para cualquier negocio.',
    thumbnail: null,
    version: '1.0.0',
    author: 'Rodacenter',
    payload: {
      company: {
        welcomeMessage: 'Hola, ¿en qué podemos ayudarte?',
        workingHours: 'Lun–Vie 9:00–18:00',
      },
      knowledge: [
        {
          category: 'FAQ',
          title: 'Contacto',
          question: '¿Cómo los contacto?',
          answer: 'Escríbenos por este chat o deja tu número para un asesor.',
          tags: ['contacto'],
        },
      ],
      automations: [
        {
          name: '[Plantilla] Registrar evento',
          trigger: 'conversation.created',
          action: { type: 'record_event', eventName: 'template.generic.chat' },
        },
      ],
    },
  },
];
