# AVANZA Plataforma

Base funcional para convertir la demo en una aplicación operativa. Incluye:

- `index.html`: interfaz AVANZA integrada.
- `server.js`: servidor HTTP sin dependencias externas.
- Persistencia atómica en `data/store.json`.
- API de salud, autenticación demo, solicitudes, métricas, pagos simulados, KYC simulado, auditoría y respaldos.
- Roles demo: `admin`, `compliance`, `collections`, `viewer`.
- Protección básica de tasa y tokens de sesión en memoria.
- `manus-routes.json` para el despliegue web.

## Ejecutar

```bash
npm start
```

Abrir `http://localhost:3000/`.

### Inicio de sesión demo por API

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"name":"Operador demo","role":"admin","password":"avanza2026"}'
```

Usar el token retornado como `Authorization: Bearer TOKEN`.

## API disponible

- `GET /api/health`
- `POST /api/auth/login`
- `GET /api/metrics`
- `GET|POST /api/applications`
- `POST /api/payments/simulate`
- `POST /api/kyc/mock`
- `GET /api/audit`
- `GET /api/backup`

## Qué queda expresamente pendiente

Este scaffold no finge tener integraciones certificadas. Para producción faltan proveedor y contrato para identidad/KYC, listas oficiales PLD, SPEI/CLABE y conciliación, correo/SMS, almacenamiento de documentos, base de datos administrada, gestión real de sesiones y roles, cifrado y rotación de secretos, monitoreo, pruebas de penetración, revisión financiera/legal mexicana, RECA/UNE/CONDUSEF y políticas de privacidad aprobadas.

La contraseña incluida es únicamente de demostración y debe eliminarse antes de cualquier uso real.
