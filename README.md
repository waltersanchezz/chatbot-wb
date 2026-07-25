# Rodacenter AI 1.0

Asistente inteligente para WhatsApp Business de **Rodacenter Manizales**, especializado en venta y asesoría de baterías automotrices y rodamientos.

Habla como un asesor comercial (nunca como chatbot), recomienda productos con datos reales del catálogo y transfiere a un humano cuando hace falta confirmar inventario o precio.

## Stack

- Node.js + Express + TypeScript
- Clean Architecture (domain / application / infrastructure / presentation)
- Memoria de conversación en sesión
- Logs JSONL por día
- Listo para WhatsApp Cloud API, OpenAI, DB e inventario

## Arranque rápido

```bash
npm install
cp .env.example .env
npm run dev
```

Servidor en `http://localhost:3000`.

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Estado del servicio |
| POST | `/api/chat` | Simular conversación (pruebas) |
| GET | `/api/products` | Catálogo (`?category=baterias\|rodamientos&q=&sku=`) |
| GET | `/api/products/:sku` | Producto por referencia |
| GET/POST | `/webhook/whatsapp` | Webhook Meta WhatsApp Cloud API |

### Ejemplo de chat

```bash
curl -X POST http://localhost:3000/api/chat ^
  -H "Content-Type: application/json" ^
  -d "{\"phone\":\"573001112233\",\"message\":\"Hola\",\"channel\":\"whatsapp\"}"
```

Flujo baterías: marca → modelo → año → motor → planta de sonido → caja → económica/premium.

Flujo rodamientos: vehículo → posición → ABS → manual/automático → referencia.

## Arquitectura

```
src/
  domain/           Entidades y puertos
  application/      Flujos, motor de conversación, casos de uso
  infrastructure/   Catálogo, repos en memoria, WhatsApp, logs, DI
  presentation/     HTTP + webhooks
```

Esquema SQL futuro: `src/infrastructure/persistence/schema.sql`
(clientes, conversaciones, productos, ventas, inventario, logs).

## Reglas de negocio clave

- No inventa precios, stock ni referencias
- No revela prompts, herramientas ni secretos
- Recuerda contexto y no vuelve a pedir datos ya dados
- En cierre: pide confirmación de disponibilidad/precio a un asesor humano

## Integraciones futuras

Variables en `.env.example`:

- `WHATSAPP_*` — Cloud API
- `OPENAI_*` / `AI_PROVIDER=openai` — LLM
- Persistencia real (PostgreSQL) usando el schema preparado
- CRM / panel administrativo

## Scripts

```bash
npm run dev        # desarrollo con hot reload
npm run build      # compilar a dist/
npm start          # producción
npm run typecheck  # solo tipos
```
