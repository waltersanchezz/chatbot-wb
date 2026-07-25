export type ProductCategory =
  | 'baterias'
  | 'rodamientos'
  | 'retenes'
  | 'grasas'
  | 'lubricantes'
  | 'accesorios'
  | 'soportes'
  | 'transmision';

export type ConversationIntent =
  | 'greeting'
  | 'baterias'
  | 'rodamientos'
  | 'otro_producto'
  | 'handoff'
  | 'unknown';

export type ConversationStage =
  | 'welcome'
  | 'awaiting_category'
  | 'collecting_vehicle'
  | 'collecting_product_details'
  | 'recommending'
  | 'closing'
  | 'handoff'
  | 'idle';

export type Channel = 'whatsapp' | 'facebook' | 'instagram' | 'web' | 'marketplace' | 'api';

export type BatteryPreference = 'economica' | 'premium' | 'indiferente';

export type TransmissionType = 'manual' | 'automatico' | 'desconocido';

export type BearingPosition =
  | 'delantero'
  | 'trasero'
  | 'izquierdo'
  | 'derecho'
  | 'delantero_izquierdo'
  | 'delantero_derecho'
  | 'trasero_izquierdo'
  | 'trasero_derecho'
  | 'desconocido';
