# Runbook: Arquitectura de Microservicios Orientados a Eventos para Fintech
## Stack portable a cualquier nube (Kubernetes)

**Versión:** 1.0  
**Stack principal:** NestJS / Go + PostgreSQL + Redis/Valkey + RabbitMQ (o Redis Streams) + Blnk (ledger)  
**Orquestación:** Kubernetes (DOKS, EKS, GKE, AKS o self-managed)  
**IaC:** Terraform  
**Observabilidad:** Prometheus + Grafana + Loki + Tempo/OpenTelemetry  

---

## 1. Visión General de la Arquitectura

### Principios clave para Fintech
- **Outbox Pattern**: garantiza que el evento se publique solo si la transacción de negocio se confirma.
- **Saga (Choreography)**: coordinación distribuida con transacciones compensatorias.
- **Idempotencia**: todas las operaciones financieras usan idempotency key.
- **Exactly-once processing** (a nivel de negocio): inbox pattern + idempotency.
- **Auditoría inmutable**: todos los eventos y movimientos del ledger son append-only.
- **Aislamiento de datos**: cada servicio tiene su propia base de datos (Database per Service).

### Servicios principales recomendados
| Servicio          | Responsabilidad principal                          | DB propia |
|-------------------|----------------------------------------------------|-----------|
| Accounts          | Cuentas, KYC básico, perfiles                      | Sí        |
| Payments          | Iniciación de pagos, integración con PSPs          | Sí        |
| Ledger            | Double-entry, balances, reconciliación (Blnk)      | Sí        |
| Fraud             | Scoring en tiempo real y reglas                    | Sí        |
| Notifications     | Email, SMS, push, webhooks                         | Sí        |
| KYC / Compliance  | Onboarding, screening, AML                         | Sí        |
| API Gateway / BFF | Routing, auth, rate limiting                       | No        |

---

## 2. Prerrequisitos

- Cluster de Kubernetes (mínimo 3 nodos para HA)
- Terraform ≥ 1.5
- kubectl + Helm
- Docker / Container Registry
- Dominio + certificados (cert-manager + Let's Encrypt)
- Cuenta en Stripe (o PSP elegido) para pagos
- GitHub / GitLab para CI/CD

---

## 3. Pasos de Implementación (Cloud-Agnostic)

### Fase 0: Preparación
1. Definir bounded contexts y contratos de eventos (usar AsyncAPI o Zod/JSON Schema).
2. Crear repositorio monorepo (NestJS) o multi-repo.
3. Configurar Terraform workspace por entorno (dev, staging, prod).

### Fase 1: Infraestructura base (Terraform)
```hcl
# Ejemplo de módulos recomendados (adaptable a cualquier provider)
module "vpc" { ... }
module "kubernetes" { ... }          # DOKS / EKS / GKE / AKS
module "postgres" { ... }            # Managed PostgreSQL o CloudNativePG
module "redis" { ... }               # Valkey / Redis managed o Bitnami
module "rabbitmq" { ... }            # RabbitMQ Cluster Operator o managed
module "registry" { ... }
```

**Recursos mínimos recomendados (prod inicial):**
- Kubernetes: 3 nodos (2-4 vCPU, 4-8 GB RAM)
- PostgreSQL: 2-4 vCPU, 8 GB RAM, HA
- Redis/Valkey: 2 GB mínimo
- RabbitMQ: 3 nodos o cluster managed

### Fase 2: Plataforma Kubernetes
```bash
# Namespaces
kubectl create ns fintech-prod
kubectl create ns observability
kubectl create ns ingress

# Instalar componentes base
helm install ingress-nginx ingress-nginx/ingress-nginx -n ingress
helm install cert-manager jetstack/cert-manager -n cert-manager
helm install external-secrets external-secrets/external-secrets -n external-secrets
```

### Fase 3: Datos y Mensajería
1. Desplegar PostgreSQL (una instancia por servicio o schemas separados al inicio).
2. Desplegar Valkey/Redis (caching + streams opcionales).
3. Desplegar RabbitMQ con management plugin y quorum queues.
4. Crear exchanges y colas:
   - `payments.events` (topic)
   - `ledger.events`
   - `fraud.events`
   - Dead Letter Queues (DLQ) para cada cola principal

### Fase 4: Servicios (ejemplo NestJS)
Estructura recomendada por servicio:
```
src/
├── domain/
├── application/
├── infrastructure/
│   ├── outbox/
│   ├── messaging/
│   └── persistence/
└── presentation/
```

**Outbox Pattern (obligatorio):**
```sql
CREATE TABLE outbox (
  id UUID PRIMARY KEY,
  aggregate_id VARCHAR NOT NULL,
  type VARCHAR NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ
);
```

Relay worker que publica a RabbitMQ y marca `published_at`.

**Saga (Choreography) ejemplo – Pago:**
1. Payments Service recibe request → guarda en DB + outbox → publica `PaymentInitiated`.
2. Ledger Service consume → registra double-entry → publica `LedgerUpdated`.
3. Fraud Service consume ambos → publica `FraudApproved` o `FraudRejected`.
4. Si rechazo → se publican eventos de compensación (`PaymentReversed`, `LedgerCompensated`).

### Fase 5: Ledger con Blnk
```bash
# Desplegar Blnk como servicio adicional
helm install blnk oci://... o docker-compose adaptado a K8s
```
Blnk expone API REST para transacciones double-entry. El servicio Ledger actúa como wrapper o se usa directamente Blnk.

### Fase 6: Observabilidad
```bash
helm install kube-prometheus-stack prometheus-community/kube-prometheus-stack -n observability
helm install loki grafana/loki -n observability
# + Grafana dashboards para:
# - Latencia por servicio
# - Event lag (RabbitMQ)
# - Outbox unpublished count
# - Saga completion rate
# - Error rate por dominio
```

### Fase 7: CI/CD (GitHub Actions)
Pipeline típico:
1. Lint + Test unitarios
2. Build Docker
3. Push a registry
4. Deploy con Helm o ArgoCD/Flux (GitOps recomendado)
5. Smoke tests + contract tests

### Fase 8: Seguridad y Cumplimiento
- mTLS entre servicios (service mesh opcional: Linkerd o Istio lite)
- Network Policies estrictas
- Secrets management (External Secrets + Vault o cloud secret manager)
- Encryption at rest (DB + volumes)
- Audit logs inmutables (todos los eventos financieros)
- Rate limiting + WAF en API Gateway
- Idempotency keys obligatorias en endpoints de dinero

---

## 4. Runbook Operacional

### 4.1 Despliegue de nueva versión
```bash
# GitOps (recomendado)
git tag v1.2.3
# ArgoCD/Flux sincroniza automáticamente

# Manual
helm upgrade payments ./charts/payments --set image.tag=v1.2.3 -n fintech-prod
```

### 4.2 Escalado
```bash
kubectl scale deployment payments --replicas=5 -n fintech-prod
# HPA recomendado basado en CPU + RabbitMQ queue depth
```

### 4.3 Incidentes comunes

| Síntoma                        | Acción inmediata                                      | Prevención                  |
|--------------------------------|-------------------------------------------------------|-----------------------------|
| Eventos no publicados          | Revisar outbox unpublished + relay worker             | Alertas en Grafana          |
| DLQ creciendo                  | Analizar mensajes, replay controlado                  | Validación estricta + retries |
| Saga atascada                  | Consultar correlation_id en logs + estado de compensaciones | Timeouts + compensaciones   |
| Latencia alta en Payments      | Escalar réplicas + revisar DB connections             | HPA + connection pooling    |
| Balance inconsistente          | Reconciliación con Blnk + replay de eventos           | Auditoría diaria            |

### 4.4 Backup y Disaster Recovery
- PostgreSQL: backups diarios + PITR (point-in-time recovery)
- RabbitMQ: persistent volumes + mirroring
- Blnk: backup de su PostgreSQL
- RTO objetivo: < 15 min | RPO: < 5 min (para datos financieros)

### 4.5 Monitoreo crítico (alertas)
- Outbox unpublished > 100 mensajes > 1 min
- Queue depth > 1000
- Error rate > 1% en servicios de dinero
- Ledger reconciliation mismatch
- Certificados expirando

---

## 5. Checklist de Producción

- [ ] Outbox + Inbox implementados en todos los servicios que publican/consumen
- [ ] Idempotency keys en todos los endpoints financieros
- [ ] DLQ configuradas y monitoreadas
- [ ] Network Policies activas
- [ ] Secrets externos (no en Git)
- [ ] Dashboards de negocio (transacciones/min, success rate, compensation rate)
- [ ] Runbooks de compensación documentados
- [ ] Pruebas de chaos (pod kill, network delay)
- [ ] Auditoría de eventos completa
- [ ] Backup + restore probados

---

## 6. Evolución recomendada
1. **MVP**: 3-4 servicios + Redis Streams (más barato)
2. **Crecimiento**: migrar a RabbitMQ + Blnk
3. **Alto volumen**: considerar Kafka o TigerBeetle para el ledger
4. **Multi-región**: Global Load Balancer + bases de datos multi-región

---

**Documento listo para usar como base de implementación.**  
Ajusta los tamaños de nodos y proveedores según la nube elegida.
