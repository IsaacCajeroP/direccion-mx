# Captura de Dirección · México

Formulario web para capturar una dirección de México, con validación y
resolución automática de Estado, Municipio, Localidad y Colonia a partir del
Código Postal, usando los catálogos oficiales provistos en `sql/catalogos_mx.sql`.

- **Frontend:** HTML + CSS + [Bootstrap 5](https://getbootstrap.com/) + JavaScript nativo (sin frameworks).
- **Backend:** Node.js + [Express](https://expressjs.com/) exponiendo una API REST.
- **Base de datos:** PostgreSQL (catálogos de SEPOMEX: estado, municipio, localidad, código postal, colonia).

El backend sirve tanto la API (`/api/*`) como los archivos estáticos del
frontend, por lo que **es una sola aplicación** que corre con un solo comando.

## ¿Por qué necesita un backend?

El navegador no puede conectarse directamente a PostgreSQL: la validación
contra ~95,000 códigos postales y ~145,000 colonias requiere consultas a una
base de datos real. El servidor Express expone esa base de datos como una API
JSON que el JavaScript del formulario consume con `fetch`.

## Estructura del repositorio

```
direccion-mx/
├── public/                 # Frontend estático
│   ├── index.html
│   ├── css/styles.css
│   └── js/app.js
├── server/                  # Backend (API + servidor)
│   ├── server.js            # Punto de entrada
│   ├── db.js                # Conexión a PostgreSQL (pool)
│   ├── routes/catalogos.js  # Endpoints /api/*
│   ├── package.json
│   └── .env.example         # Plantilla de variables de entorno
├── sql/
│   └── catalogos_mx.sql     # Dump con esquema + datos de los catálogos
└── README.md
```

## Modelo de datos

```
estado (clave PK, pais, nombre_estado)
municipio (clave, estado, descripcion)      PK(clave, estado) → FK estado
localidad (clave, estado, descripcion)      PK(clave, estado) → FK estado
codigo_postal (cp PK, estado, municipio, localidad) → FK (municipio, estado), FK (localidad, estado)
colonia (clave, cp, descripcion)            PK(clave, cp) → FK codigo_postal(cp)
```

> Nota: en el catálogo fuente, algunos códigos postales tienen `municipio` y/o
> `localidad` en `NULL`. La aplicación lo contempla: si ocurre, esos campos
> quedan sin preseleccionar para que el usuario los elija manualmente.

---

## 1. Requisitos previos

- [Node.js](https://nodejs.org/) 18 o superior (incluye npm)
- [PostgreSQL](https://www.postgresql.org/download/) 13 o superior
- Git
- (Opcional) [Visual Studio Code](https://code.visualstudio.com/)

## 2. Configurar la base de datos

### 2.1 Crear la base de datos

```bash
# Con la utilidad createdb (requiere el cliente de PostgreSQL instalado)
createdb catalogos_mx

# ...o desde psql
psql -U postgres -c "CREATE DATABASE catalogos_mx;"
```

### 2.2 Importar el catálogo

El repositorio incluye el dump con el esquema y los datos ya listos
(`sql/catalogos_mx.sql`):

```bash
psql -U postgres -d catalogos_mx -f sql/catalogos_mx.sql
```

Esto crea las 5 tablas (`estado`, `municipio`, `localidad`, `codigo_postal`,
`colonia`), carga ~244,000 registros y agrega las llaves primarias, foráneas
e índices. Verifica que se haya importado correctamente:

```bash
psql -U postgres -d catalogos_mx -c "
  SELECT 'estado' t, count(*) FROM estado
  UNION ALL SELECT 'municipio', count(*) FROM municipio
  UNION ALL SELECT 'localidad', count(*) FROM localidad
  UNION ALL SELECT 'codigo_postal', count(*) FROM codigo_postal
  UNION ALL SELECT 'colonia', count(*) FROM colonia;
"
```

Deberías ver: `estado: 32`, `municipio: 2463`, `localidad: 664`,
`codigo_postal: 95748`, `colonia: 145366`.

## 3. Configurar y correr el backend

```bash
cd server
npm install
cp .env.example .env
```

Edita `server/.env` con los datos de tu conexión local a PostgreSQL:

```ini
PORT=3000

DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=tu_password
DB_NAME=catalogos_mx

DB_SSL=false
```

Levanta el servidor:

```bash
npm start
# o, para desarrollo con recarga automática:
npm run dev
```

Abre **http://localhost:3000** en el navegador — ahí se sirve el formulario
completo (el mismo servidor atiende `/` y `/api/*`).

## 4. Cómo funciona el formulario

**Parte 1 — Carga inicial**
1. Al cargar la página se consulta `GET /api/estados` y se llena el
   desplegable de Estado.
2. Al seleccionar un Estado se consultan `GET /api/municipios/:estado` y
   `GET /api/localidades/:estado` para llenar Municipio y Localidad. Colonia
   permanece deshabilitada hasta que se indique un Código Postal.

**Parte 2 — Resolución por Código Postal**
3. Al perder el foco el campo Código Postal, se consulta
   `GET /api/codigo-postal/:cp`. Si existe, se selecciona automáticamente el
   Estado, se cargan Municipio y Localidad de ese estado y se preseleccionan
   los que correspondan al CP, y se llena Colonia con las opciones
   disponibles para ese CP.
4. Si el CP no existe en el catálogo, se marca el campo como inválido con un
   mensaje de error y se limpian los campos dependientes.

**Parte 3 — Validación final**
5. Al hacer clic en "Continuar" se valida que todos los campos estén
   completos y se envían a `POST /api/validar-direccion`, que confirma en el
   servidor que la combinación CP / Estado / Municipio / Localidad / Colonia
   sea consistente con los catálogos. Se muestra un mensaje de éxito o de
   error indicando la causa específica.

## 5. Referencia de la API

| Método | Endpoint                     | Descripción                                              |
|--------|-------------------------------|-----------------------------------------------------------|
| GET    | `/api/estados`                | Lista de estados                                          |
| GET    | `/api/municipios/:estado`     | Municipios de un estado (clave, ej. `JAL`)                 |
| GET    | `/api/localidades/:estado`    | Localidades de un estado                                   |
| GET    | `/api/codigo-postal/:cp`      | Resuelve un CP: estado, municipio, localidad y colonias    |
| POST   | `/api/validar-direccion`      | Valida `{cp, estado, municipio, localidad, colonia, calle}` |

Ejemplo de `POST /api/validar-direccion`:

```json
{
  "cp": "44100",
  "estado": "JAL",
  "municipio": "039",
  "localidad": "03",
  "colonia": "0003",
  "calle": "Av. Juárez 123"
}
```

Respuesta si es válida: `{ "valid": true, "message": "La dirección es válida." }`
Respuesta si no: `{ "valid": false, "errors": ["..."] }`

---

## 6. Subir el proyecto a GitHub

Desde la carpeta raíz del proyecto:

```bash
git init
git add .
git commit -m "Formulario de dirección MX con validación por catálogo"
```

Crea un repositorio vacío en GitHub (sin README/licencia, para evitar
conflictos): entra a [github.com/new](https://github.com/new), asígnale un
nombre (por ejemplo `direccion-mx`) y crea el repositorio. Luego:

```bash
git branch -M main
git remote add origin https://github.com/<tu-usuario>/direccion-mx.git
git push -u origin main
```

> El archivo `.gitignore` ya excluye `node_modules/` y `.env`, así que las
> credenciales nunca se suben al repositorio.

## 7. Desplegar la aplicación

La app necesita **un servicio Node.js + una base de datos PostgreSQL**
accesible entre sí. La forma más simple y gratuita es
[Render](https://render.com):

### 7.1 Base de datos (PostgreSQL en Render)

1. En el dashboard de Render → **New +** → **PostgreSQL**.
2. Dale un nombre (ej. `catalogos-mx-db`) y crea la instancia.
3. Cuando esté lista, copia el **"Internal Database URL"** (o "External
   Database URL" si vas a importar los datos desde tu máquina).
4. Importa el catálogo apuntando a esa base:
   ```bash
   psql "<External Database URL>" -f sql/catalogos_mx.sql
   ```

### 7.2 Servicio web (backend + frontend)

1. En el dashboard de Render → **New +** → **Web Service** → conecta tu
   repositorio de GitHub.
2. Configura:
   - **Root Directory:** `server`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
3. En la sección **Environment**, agrega las variables:
   - `DATABASE_URL` → el **Internal Database URL** de tu Postgres de Render
   - `DB_SSL` → `true`
4. Crea el servicio. Render instalará dependencias, arrancará
   `node server.js` y te dará una URL pública (`https://tu-app.onrender.com`)
   donde el formulario ya estará disponible.

### 7.3 Alternativas

- **Railway** (railway.app): flujo similar — crea un plugin de PostgreSQL,
  importa el `.sql`, agrega un servicio desde el repo con `DATABASE_URL`
  apuntando al plugin, `Root Directory: server`, `Start Command: npm start`.
- **Un VPS propio** (DigitalOcean, EC2, etc.): instala Node y PostgreSQL,
  clona el repositorio, importa el `.sql`, configura `.env` y corre la app
  detrás de un proceso persistente (`pm2 start server.js`) y un proxy
  (nginx) hacia el puerto `3000`.

> **Importante:** no se puede desplegar únicamente en GitHub Pages, porque
> GitHub Pages solo sirve archivos estáticos y esta aplicación necesita un
> proceso Node.js corriendo y conectado a PostgreSQL.

---

## 8. Solución de problemas

- **"No se pudieron cargar los estados"**: revisa que PostgreSQL esté
  corriendo y que las variables en `server/.env` sean correctas. Revisa la
  consola del servidor (`npm run dev`) para ver el error real de conexión.
- **Error de SSL al conectar a una base de datos en la nube**: pon
  `DB_SSL=true` en tus variables de entorno.
- **El código postal siempre da "no encontrado"**: confirma que el `.sql` se
  haya importado completo (`SELECT count(*) FROM codigo_postal;` debe dar
  `95748`).
