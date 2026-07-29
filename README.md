# MasivoApp — Promos por WhatsApp (v2)

App de una sola página (sin backend) para que los ejecutivos manden promos por WhatsApp a su cartera, en tandas seguras.

Ver `index.html` para el código completo. No requiere build ni instalación de dependencias — es HTML/CSS/JS puro, con SheetJS cargado desde CDN para leer Excel/CSV.

## Qué mejora esta versión

- Configuración por ejecutivo/tienda (ya no hardcodeada a una sola sucursal)
- Normalización de números MX + deduplicación automática
- Rate limiter duro (tandas + pausa obligatoria, no solo consejo)
- Lista de bajas persistente por tienda
- Generador de plantilla con identificación + línea de BAJA
- Checkbox de consentimiento antes de habilitar envíos
- Aviso de privacidad simplificado
- Manejo de errores al leer el archivo
- `noindex` para no aparecer en buscadores

## Cómo desplegar en Netlify (primera vez)

1. Crea un repositorio nuevo en GitHub (puede ser privado) y sube estos archivos.
2. Entra a [app.netlify.com](https://app.netlify.com) → **Add new project** → **Import an existing project**.
3. Conecta tu cuenta de GitHub y autoriza acceso al repo.
4. Selecciona el repo. Build command: déjalo vacío. Publish directory: `.` (ya viene configurado en `netlify.toml`).
5. Deploy. Netlify te da una URL tipo `tu-app.netlify.app` — puedes cambiar el subdominio en **Site settings → Domain management**.

## Cómo actualizar después

Cada vez que hagas push a la rama principal (`main`), Netlify vuelve a desplegar solo. No necesitas tocar nada en el dashboard.

```bash
git add .
git commit -m "descripción del cambio"
git push
```

## Cómo subirlo sin GitHub (más rápido, pero sin historial de cambios)

En Netlify, ve a tu sitio → **Deploys** → arrastra la carpeta completa (o el `index.html`) a la zona de "Drag and drop". Esto reemplaza el sitio en el momento, pero no queda respaldado en ningún repo.

## Pendiente para la siguiente fase (Sprint 1)

Los hallazgos que esta versión **no** resuelve porque requieren backend (ver auditoría técnica):

- H-01: la cartera sigue viajando como archivo suelto en el celular del ejecutivo
- H-03: no hay cotejo automático contra REPEP
- H-04: no hay login — cualquiera con la URL puede usar la app

Eso implica Firebase Auth + Firestore, descrito en la sección "Arquitectura objetivo (v2)" del documento de auditoría.
