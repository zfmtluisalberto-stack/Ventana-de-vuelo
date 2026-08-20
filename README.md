# Ventana de Vuelo

Panel go/no-go para decidir si las condiciones meteorológicas permiten un
despegue seguro con un drone VTOL (pensado para el eXplora Tailsitter u otro
VTOL similar) en un levantamiento fotogramétrico, enfocado en la costa de
Baja California Sur (La Paz, Los Cabos, Loreto, Todos Santos) pero funciona
para cualquier coordenada.

Consulta pronóstico horario en vivo de [Open-Meteo](https://open-meteo.com/)
(gratis, sin API key) y evalúa cada hora contra umbrales de:

- Viento sostenido y ráfagas (a 10 m y 80 m)
- Probabilidad de lluvia
- Visibilidad
- Riesgo de neblina (margen temperatura − punto de rocío)
- Nubosidad, como indicador de **calidad de imagen** (no de seguridad)

Muestra una franja de 72 horas tipo "código de barras" para ver de un
vistazo las ventanas de vuelo disponibles, y permite ajustar todos los
umbrales desde la interfaz (se guardan en `localStorage` del navegador).

## Requisitos

- Node.js 18 o superior
- npm

## Uso local

```bash
npm install
npm run dev
```

Abre la URL que muestre la terminal (por defecto `http://localhost:5173`).

## Build de producción

```bash
npm run build
npm run preview   # para probar el build localmente
```

Los archivos estáticos quedan en `dist/`.

## Desplegar

### Opción A — Vercel o Netlify (recomendado, sin configuración extra)

1. Sube el repo a GitHub (ver abajo).
2. En vercel.com o netlify.com, importa el repositorio.
3. Framework preset: **Vite**. Build command: `npm run build`. Output dir: `dist`.
4. Deploy. Listo — no necesitas tocar `vite.config.js`.

### Opción B — GitHub Pages

1. En `vite.config.js`, descomenta y ajusta la línea `base:` con el nombre
   exacto de tu repositorio, por ejemplo:
   ```js
   base: '/ventana-de-vuelo/',
   ```
2. Corre:
   ```bash
   npm run deploy
   ```
   Esto construye el proyecto y publica `dist/` en la rama `gh-pages`
   (usa el paquete `gh-pages`, ya incluido en `devDependencies`).
3. En GitHub → Settings → Pages, selecciona la rama `gh-pages` como fuente.

## Subir a GitHub desde cero

```bash
git init
git add .
git commit -m "Ventana de Vuelo: panel go/no-go para VTOL"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/ventana-de-vuelo.git
git push -u origin main
```

## Calibrar los umbrales

Los valores por defecto (viento 20/30 km/h, ráfagas 25/35 km/h, etc.) son un
punto de partida razonable para un VTOL ligero, **no son las especificaciones
oficiales del eXplora**. Ajusta cada umbral desde el panel "Ajustar umbrales"
en la app según:

- Los límites de viento que reporte el fabricante o tus pruebas de vuelo
- Tu manual de operaciones bajo AFAC/SEMARNAT
- El comportamiento real observado en campo durante la transición VTOL

Los cambios se guardan automáticamente en el navegador.

## Fuente de datos

Open-Meteo API (https://open-meteo.com/en/docs) — modelos GFS/ICON, gratuita
y sin necesidad de API key, con CORS habilitado para uso desde el navegador.

## Aviso

Esta herramienta apoya la decisión go/no-go; no sustituye el juicio del
piloto en sitio ni las regulaciones vigentes de AFAC para operación de
drones en México.
