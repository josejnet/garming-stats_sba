# MostlyZ2

Panel personal con MostlyZ2 Agent para ver tus estadisticas de entrenamiento: actividades, mapas, zonas de FC, fitness (CTL/ATL/TSB), records y mas.

Los datos se descargan de Garmin Connect y Strava a archivos locales en tu ordenador. La app los lee desde ahi; no hay servidor en la nube ni base de datos.

---

## Qué necesitas antes de empezar

Instala estas dos cosas si no las tienes ya:


| Programa                      | Para qué sirve            | Cómo comprobarlo                             |
| ----------------------------- | ------------------------- | -------------------------------------------- |
| **Node.js** (v18 o superior)  | Ejecutar la app web       | Abre una terminal y escribe `node --version` |
| **Python** (v3.10 o superior) | Descargar datos de Garmin | Escribe `python3 --version`                  |


También necesitas una **cuenta de Garmin Connect** (la misma que usas en la app del móvil o en [connect.garmin.com](https://connect.garmin.com)).

> **¿No tienes Node.js o Python?**
>
> - Node.js: [https://nodejs.org](https://nodejs.org) → descarga la versión LTS.
> - Python: [https://python.org/downloads](https://python.org/downloads) → en Mac/Linux suele venir instalado.

---

## Guía paso a paso

### 1. Descargar el proyecto

Si ya tienes la carpeta `MostlyZ2` en tu ordenador, abrela en la terminal:

```bash
cd ruta/donde/esta/MostlyZ2
```

(Sustituye `ruta/donde/esta/MostlyZ2` por la ruta real, por ejemplo `/Users/tu-usuario/Documents/MostlyZ2`.)

---

### 2. Configurar tus credenciales de Garmin

La app necesita tu email y contraseña de Garmin Connect para descargar tus actividades. **Nunca subas este archivo a internet.**

1. Copia el archivo de ejemplo:
  ```bash
   cp .env.example .env
  ```
2. Abre `.env` con cualquier editor de texto y rellena tus datos:
  ```
   GARMIN_EMAIL=tu@email.com
   GARMIN_PASSWORD=tu_contraseña
  ```
   Usa el mismo email y contraseña con los que entras en Garmin Connect.

---

### 3. Instalar dependencias de Python (sincronización)

Entra en la carpeta `fetch` e instala las librerías necesarias:

```bash
cd fetch
python3 -m pip install -r requirements.txt
cd ..
```

> Si `pip` no funciona, prueba con `python3 -m pip install -r requirements.txt` desde la carpeta `fetch`.

---

### 4. Descargar tus actividades de Garmin

Desde la carpeta raiz del proyecto (`MostlyZ2`):

```bash
python3 fetch/sync.py --limit N
```

**Qué hace este comando:**

- Inicia sesión en Garmin Connect con tu `.env`
- Descarga la lista de actividades y los detalles de cada una
- Guarda todo en `public/data/` (archivos JSON)

La primera vez puede tardar **varios minutos** si tienes muchas actividades. Verás el progreso en la terminal.

**Opciones útiles:**

```bash
# Solo las 20 actividades más recientes (para probar)
python3 fetch/sync.py --limit 20

# Solo actividades desde una fecha
python3 fetch/sync.py --since 2024-01-01

# Más rápido, sin descargar rutas GPS
python3 fetch/sync.py --no-gpx
```

> **Importante:** vuelve a ejecutar `python3 fetch/sync.py` cuando quieras actualizar los datos con entrenamientos nuevos. Las actividades ya descargadas no se vuelven a pedir a Garmin.

---

### 5. Instalar dependencias de la app web

En la carpeta raíz del proyecto:

```bash
npm install
```

Solo hace falta hacerlo **una vez** (o cuando cambien las dependencias del proyecto).

---

### 6. Abrir la app

```bash
npm run dev
```

Verás algo como:

```
  ➜  Local:   http://localhost:5173/
```

Abre ese enlace en el navegador (Chrome, Firefox, Safari…).

Para **cerrar** la app, vuelve a la terminal y pulsa `Ctrl + C`.

---

## Resumen rápido (cuando ya lo hayas hecho una vez)

Cada vez que quieras usar la app con datos actualizados:

```bash
# 1. Sincronizar datos nuevos de Garmin
python3 fetch/sync.py

# 2. Arrancar la app
npm run dev
```

Luego abre [http://localhost:5173](http://localhost:5173) en el navegador.

---

## Conectar Strava (opcional)

1. Crea una aplicación en [Strava API](https://www.strava.com/settings/api).
2. Usa `localhost` como **Authorization Callback Domain**.
3. Añade el Client ID y Client Secret a `.env`:

```env
STRAVA_CLIENT_ID=tu_client_id
STRAVA_CLIENT_SECRET=tu_client_secret
```

4. Autoriza e importa tu historial:

```bash
python fetch/strava_sync.py --authorize
```

Las siguientes actualizaciones ya no necesitan abrir el navegador:

```bash
python fetch/strava_sync.py
```

La combinación detecta duplicados por deporte, hora de inicio, distancia y duración. Cuando una actividad existe en Garmin y Strava, se conserva la versión de Strava y se reutilizan los detalles Garmin que Strava no incluye en su listado.

Los tokens se guardan en `.strava_tokens.json`, que está excluido de Git.

---

## Ajustes dentro de la app

En el menú lateral, entra en **Ajustes** para configurar:

- FC máxima
- FTP (ciclismo)
- FC y ritmo en umbral (running)

Estos valores se guardan en tu navegador y afectan a los cálculos de zonas, TSS y fitness.

---

## Problemas frecuentes

### "ERROR: Set GARMIN_EMAIL and GARMIN_PASSWORD in .env"

No existe el archivo `.env` o está vacío. Repite el **paso 2**.

### "Authentication failed" al sincronizar

- Comprueba que el email y la contraseña en `.env` son correctos.
- Si tienes verificación en dos pasos (2FA) en Garmin, puede que falle el login automático. Prueba a desactivarla temporalmente o revisa la documentación de la librería `garminconnect`.

### "No se encontró /data/activities.json" en la app

Aún no has sincronizado datos. Ejecuta primero:

```bash
python3 fetch/sync.py
```

### La terminal dice que `node` o `npm` no existen

Instala Node.js desde [nodejs.org](https://nodejs.org) y vuelve a abrir la terminal.

### La sincronización va muy lenta

Es normal: hay una pausa entre peticiones para no saturar la API de Garmin. Para una prueba rápida usa `--limit 20` o `--no-gpx`.

### Puerto 5173 ya en uso

Cierra otras ventanas de terminal donde tengas `npm run dev` corriendo, o Vite te propondrá otro puerto (por ejemplo 5174).

---

## Comandos extra (opcional)


| Comando           | Descripción                                                |
| ----------------- | ---------------------------------------------------------- |
| `npm run build`   | Genera una versión optimizada en la carpeta `dist/`        |
| `npm run preview` | Previsualiza la versión de producción (después de `build`) |
| `npm run lint`    | Revisa el código con el linter                             |


---

## Estructura del proyecto (referencia)

```
MostlyZ2/
├── .env                 ← Tus credenciales (no compartir)
├── fetch/
│   ├── sync.py          ← Script que descarga datos de Garmin
│   └── requirements.txt ← Dependencias de Python
├── public/data/         ← Datos descargados (JSON)
└── src/                 ← Código de la app web (React)
```

---

## Privacidad y qué NO subir a GitHub

Estos archivos contienen datos personales o credenciales. El `.gitignore` ya los excluye, pero conviene conocerlos:

| Archivo / carpeta | Qué contiene | Riesgo |
|-------------------|--------------|--------|
| `.env` | Email y contraseña de Garmin Connect | Acceso total a tu cuenta |
| `public/data/` | Actividades, estadísticas y rutas GPS | Ubicación exacta, salud, hábitos |
| `dist/data/` | Copia de los datos al hacer `npm run build` | Igual que arriba |
| `~/.garth/` (en tu home) | Tokens de sesión de Garmin | Acceso a la API sin contraseña |

**Datos sensibles dentro de los JSON:**
- Coordenadas GPS de cada entrenamiento (pueden revelar dónde vives o entrenas)
- Ciudades en los títulos de actividades
- FC, VO2max, calorías, ritmos y patrones horarios

**Seguro para publicar:**
- `.env.example` (solo tiene placeholders)
- Todo el código en `src/` y `fetch/`

**Antes de hacer `git push`**, comprueba que no se cuelen datos:

```bash
git status
```

No deberían aparecer `.env` ni archivos dentro de `public/data/`. Si alguna vez los añadiste por error:

```bash
git rm -r --cached public/data/
git rm --cached .env
```

Luego haz commit de la eliminación. Si ya los subiste a GitHub, **cambia tu contraseña de Garmin** y considera borrar el historial del repositorio.

