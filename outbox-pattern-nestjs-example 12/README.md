# Outbox Pattern - NestJS + RabbitMQ + PostgreSQL

Ejemplo simple y listo para usar del **Outbox Pattern** en NestJS.

Garantiza que el evento se publique solo si el pago se guarda correctamente.

## Cómo ejecutarlo

```bash
docker-compose up --build
```

## Probar

```bash
curl -X POST http://localhost:3000/api/payments \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 250.75,
    "currency": "MXN",
    "idempotencyKey": "pago-001"
  }'
```

## Qué hace

1. Guarda el pago en PostgreSQL
2. Guarda el evento en la tabla `outbox` (misma operación)
3. Un relay publica el evento a RabbitMQ cada 2 segundos
4. Ideal para flujos de pago en Fintech

**RabbitMQ UI:** http://localhost:15672 (guest/guest)
