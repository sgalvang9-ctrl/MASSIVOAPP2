# MasivoApp — Promos por WhatsApp (v2)

App de una sola página (sin backend) para que los ejecutivos manden promos por WhatsApp a su cartera, en tandas seguras. Instalable como app (PWA).

## Archivos del repo

- `index.html` — la app completa
- `manifest.json` — configuración para que sea instalable como app
- `sw.js` — service worker (funcionamiento offline del cascarón de la app)
- `icons/` — íconos para la pantalla de inicio
- `netlify.toml` — config de publish + header noindex
- `README.md` — este archivo

## Qué mejora esta versión

- Configuración por ejecutivo/tienda (ya no hardcodeada a una sola sucursal)
- Normalización de números MX + deduplicación automática
- Rate limiter por tandas + tope duro de mensajes por bloque de horas (ventana móvil)
- Horario de envío restringido (regla dura, configurable)
- Lista de bajas persistente por tienda
- Generador de plantilla con identificación + línea de BAJA
- Checkbox de consentimiento antes de habilitar envíos
- Aviso de privacidad simplificado
- Reporte descargable en PDF (automático por tanda + botón manual)
- Exportar / importar respaldo del historial y las bajas
- Manejo de errores al leer el archivo
- **Instalable como app** (agregar a pantalla de inicio, funciona offline el cascarón)
- `noindex` para no aparecer en buscadores

## Cómo desplegar en Netlify (primera vez)

1. Crea un repositorio nuevo en GitHub (puede ser privado) y sube **todos** los archivos, incluyendo la carpeta `icons/` completa.
2. Entra a [app.netlify.com](https://app.netlify.com) → **Add new project** → **Import an existing project**.
3. Conecta tu cuenta de GitHub y autoriza acceso al repo.
4. Selecciona el repo. Build command: déjalo vacío. Publish directory: `.` (ya viene configurado en `netlify.toml`).
5. Deploy. Netlify te da una URL tipo `tu-app.netlify.app` — puedes cambiar el subdominio en **Site settings → Domain management**.

## Cómo actualizar después

Cada vez que hagas push a la rama principal (`main`), Netlify vuelve a desplegar solo.

## Cómo instalarla como app (para cada ejecutivo)

**Android (Chrome):** abre la URL → menú ⋮ → "Instalar app" o "Agregar a pantalla de inicio".

**iPhone (Safari):** abre la URL → botón de compartir (el cuadrito con la flecha) → "Agregar a pantalla de inicio". En iPhone tiene que ser desde Safari, no desde Chrome — es una limitación de iOS, no de la app.

Una vez instalada, se abre en pantalla completa como cualquier app, sin la barra del navegador.

## Pendiente para la siguiente fase (Sprint 1)

Los hallazgos que esta versión **no** resuelve porque requieren backend (ver auditoría técnica):

- H-01: la cartera sigue viajando como archivo suelto en el celular del ejecutivo
- H-03: no hay cotejo automático contra REPEP
- H-04: no hay login — cualquiera con la URL puede usar la app

Eso implica Firebase Auth + Firestore, descrito en la sección "Arquitectura objetivo (v2)" del documento de auditoría.

