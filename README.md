# León Centro — Herramientas (v3)

Sitio con dos apps integradas en una sola pantalla con pestañas: **Promos por WhatsApp** y **Check List de Salida**. Sin backend propio, instalable como app (PWA).

## Archivos del repo

- `index.html` — la "concha": pestañas Promos / Checklist, carga cada app en un iframe aislado
- `promos.html` — MasivoApp (promos por WhatsApp) — antes era el `index.html`
- `checklist_salida.html` — Check List de Salida, León Centro
- `manifest.json` — configuración PWA (nombre general, íconos)
- `sw.js` — service worker (cachea las 3 páginas para uso offline del cascarón)
- `icons/` — íconos para la pantalla de inicio
- `netlify.toml` — config de publish + header noindex
- `google-apps-script.gs` — receptor de reporte centralizado, control de acceso, plantilla autorizada, y conteo de mensajes por ATTUID/fecha (usado por ambas apps)
- `README.md` — este archivo

## Por qué "concha con iframes" y no un solo archivo fusionado

Promos y Checklist son apps grandes, cada una con sus propios nombres de clases CSS y funciones JS (algunos coinciden, ej. `.card`, `.toggle-row`). Fusionarlas en un solo documento HTML habría hecho que el CSS de una pisara el de la otra. Con iframes, cada app vive en su propio mundo aislado — cero riesgo de choques — y desde la persona que usa el sitio, se siente como una sola app con pestañas, sin recargar la página al cambiar.

## Qué incluye Promos (promos.html)

- Configuración por ejecutivo/tienda/ATTUID
- Normalización de números MX + deduplicación automática
- 15 segundos fijos entre cada mensaje (no editable por el ejecutivo)
- Enfriamiento por cliente (no recontactar antes de X días, cruzando historial completo)
- Lista de bajas y de números "no existe", separadas y persistentes
- Generador de plantilla con identificación + línea de BAJA, o plantilla autorizada centralizada
- Checkbox de consentimiento antes de habilitar envíos
- Pausa de emergencia (bloqueo total si se restringe la cuenta)
- Reporte descargable en PDF (botón manual)
- Exportar / importar respaldo del historial, bajas y "no existe"
- Bitácora local de cargas y eventos
- Reporte centralizado opcional por ATTUID vía Google Sheet
- Control de acceso por lista blanca de ATTUIDs (opcional)

## Qué incluye Checklist (checklist_salida.html)

- Registro diario por día de la semana: CRM, prospección, citas confirmadas, reseñas, limpieza
- Activos del día: Pospago equipo nuevo, Pospago equipo propio, Renovación, Accesorios, Seguros
- ARPU del día (equipo nuevo / equipo propio / renovaciones), captura manual
- Compromiso semanal con descuento acumulado (metas por categoría, se ve cuánto falta conforme avanza la semana)
- Mensajes del día ligados a Promos — se jalan automáticamente por ATTUID + fecha, no se escriben a mano
- Semana calculada automáticamente (lunes actual) al abrir
- Corte de caja, Yubikey, cheque de salida
- Evidencia por WhatsApp (imagen) y reporte imprimible/PDF
- Config (ATTUID, ejecutivo, URL de Sheet) persistente en el celular — el resto de los datos del día, no

## Cómo desplegar en Netlify (primera vez)

1. Crea un repositorio nuevo en GitHub (puede ser privado) y sube **todos** los archivos, incluyendo la carpeta `icons/` completa.
2. Entra a [app.netlify.com](https://app.netlify.com) → **Add new project** → **Import an existing project**.
3. Conecta tu cuenta de GitHub y autoriza acceso al repo.
4. Selecciona el repo. Build command: vacío. Publish directory: `.` (ya viene en `netlify.toml`).
5. Deploy. Netlify te da una URL tipo `tu-app.netlify.app`.

## Cómo actualizar después

Cada push a `main` redespliega solo en Netlify.

## Cómo instalarla como app

**Android (Chrome):** abre la URL raíz (`tu-sitio.netlify.app`) → menú ⋮ → "Instalar app". Se instala la concha con pestañas.

**iPhone (Safari):** abre la URL raíz **en Safari** → botón de compartir 📤 → "Agregar a pantalla de inicio".

Acceso directo a cada app sin pestañas, si alguna vez lo necesitas: `tu-sitio.netlify.app/promos.html` o `/checklist_salida.html`.

## Reporte centralizado, control de acceso, plantilla y conteo de mensajes por ATTUID

Ambas apps comparten el mismo Google Sheet vía `google-apps-script.gs`:

1. Sigue las instrucciones dentro de `google-apps-script.gs` para crear el Sheet receptor.
2. Ejecuta `configurarHojasIniciales` una vez — crea las hojas **Envíos**, **Resumen**, y **Config**.
3. En **Config**: columna A = ATTUIDs autorizados (vacío = todos permitidos). Celda C2 = mensaje autorizado.
4. Copia la URL `/exec` y pégala en la configuración de **Promos** (cada ejecutivo) y en el campo "URL reporte MasivoApp" del **Checklist**.
5. El Checklist usa la misma URL + el ATTUID para jalar automáticamente cuántos mensajes mandó ese ejecutivo cada día, en vez de que lo escriban a mano.

**Límite real:** ambas apps controlan actividad y accesos, pero no pueden verificar que un mensaje sugerido efectivamente se haya pegado y enviado dentro de WhatsApp — eso vive fuera de cualquier código de este repo.

## Pendiente para la siguiente fase (Sprint 1)

Los hallazgos que esta versión **no** resuelve porque requieren backend real (ver auditoría técnica original de Promos):

- H-01: la cartera de Promos sigue viajando como archivo suelto en el celular del ejecutivo
- H-03: no hay cotejo automático contra REPEP
- H-04: no hay login real — el control de acceso por ATTUID es una lista blanca simple, no autenticación
- El Checklist no tiene autoguardado/persistencia del contenido capturado (solo su configuración: ATTUID, ejecutivo, URL) — perder la pestaña sin guardar pierde los datos del día

Eso implica Firebase Auth + Firestore, descrito en la sección "Arquitectura objetivo (v2)" del documento de auditoría original.
