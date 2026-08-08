export interface MockClient {
  id: string
  name: string
  phone: string
  lastVehicle: string
  conversations: number
  lastContact: string
  city: string
}

export interface MockStat {
  id: string
  label: string
  value: string
  delta: string
  trend: 'up' | 'down' | 'flat'
}

export interface MockRankingRow {
  id: string
  label: string
  count: number
}

export const mockStats: MockStat[] = [
  {
    id: 'conv-today',
    label: 'Conversaciones hoy',
    value: '48',
    delta: '+12%',
    trend: 'up',
  },
  {
    id: 'finished',
    label: 'Terminadas',
    value: '31',
    delta: '+8%',
    trend: 'up',
  },
  {
    id: 'abandoned',
    label: 'Abandonadas',
    value: '7',
    delta: '-3%',
    trend: 'down',
  },
  {
    id: 'avg-time',
    label: 'Tiempo promedio',
    value: '4:12',
    delta: 'estable',
    trend: 'flat',
  },
]

export const mockClients: MockClient[] = [
  {
    id: 'cl-01',
    name: 'Carlos Mejía',
    phone: '+57 300 111 2233',
    lastVehicle: 'Renault Logan 2015',
    conversations: 3,
    lastContact: 'Hoy',
    city: 'Manizales',
  },
  {
    id: 'cl-02',
    name: 'Laura Gómez',
    phone: '+57 310 444 5566',
    lastVehicle: 'Mazda 2 2020',
    conversations: 1,
    lastContact: 'Hoy',
    city: 'Villamaría',
  },
  {
    id: 'cl-03',
    name: 'Diana Palacio',
    phone: '+57 301 222 3344',
    lastVehicle: 'Kia Rio 2019',
    conversations: 5,
    lastContact: 'Ayer',
    city: 'Manizales',
  },
  {
    id: 'cl-04',
    name: 'Andrés Ríos',
    phone: '+57 320 777 8899',
    lastVehicle: 'Chevrolet Spark 2018',
    conversations: 2,
    lastContact: 'Hace 3 días',
    city: 'Chinchiná',
  },
]

export const mockTopVehicles: MockRankingRow[] = [
  { id: 'v1', label: 'Renault Logan 2015', count: 18 },
  { id: 'v2', label: 'Mazda 2 2020', count: 12 },
  { id: 'v3', label: 'Chevrolet Spark 2018', count: 9 },
  { id: 'v4', label: 'Kia Rio 2019', count: 7 },
]

export const mockTopReferences: MockRankingRow[] = [
  { id: 'r1', label: 'FAKE-LOG', count: 14 },
  { id: 'r2', label: 'FAKE-M2', count: 11 },
  { id: 'r3', label: 'FAKE-SP', count: 8 },
  { id: 'r4', label: 'FAKE-KIA', count: 6 },
]

export const mockSettings = {
  companyName: 'Rodacenter Manizales',
  timezone: 'America/Bogota',
  sessionTtlMinutes: 120,
  recoveryTtlMinutes: 1440,
  channel: 'WhatsApp Business (mock)',
  environment: 'MVP — datos simulados',
}

/** Simula latencia de red para TanStack Query (sin API real). */
export function delay<T>(value: T, ms = 450): Promise<T> {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(value), ms)
  })
}
