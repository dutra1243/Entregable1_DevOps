# Entrevista Técnica para CodigoDelSur
Por Mauro Machado

## Descripción

Este *challenge* corresponde a la evaluación técnica del proceso de reclutamiento de CodigoDelSur.

En el presente repositorio se encuentra desarrollada una API RESTful con Node.js y Express que integra la API de TheMovieDatabase (TMDB) para gestionar películas favoritas. La aplicación permite:

- **Autenticación de usuarios**: Registro e inicio de sesión con tokens JWT
- **Gestión de películas favoritas**: Los usuarios pueden agregar y consultar sus películas favoritas
- **Integración con TMDB**: Obtención automática de información detallada de películas desde la API de TMDB
- **Sugerencias personalizadas**: Sistema de puntuación aleatoria para sugerir películas del día

### Características técnicas

- **Base de datos**: SQLite3 para persistencia local de datos (usuarios, películas, favoritos y *blacklisted* JWT *tokens*)
- **Seguridad**: 
  - Encriptación de contraseñas con Bcrypt
  - Autenticación mediante JWT (JSON Web Tokens)
  - Generación de identificadores únicos con uuidv4
- **Resource files**: Sistema de mensajes externalizados con *deferred binding* que permite modificar mensajes de error y respuestas sin recompilar, con recarga automática en tiempo de ejecución
- **Testing**: Tests unitarios con Jest para el endpoint de favoritos (`/api/favorites`)
- **Validación**: Manejo de errores y validaciones para casos como:
  - Películas duplicadas en favoritos (409)
  - Películas no disponibles en TMDB (404)
  - Usuarios no encontrados (404)
  - Datos faltantes (400)

**Nota**: La base de datos es ignorada por `.gitignore` y se crea automáticamente en la primera ejecución, manteniéndose persistente solo de forma local.

## Estructura del proyecto

Se implementó a nivel estructural un modelo ruta-controlador simplificado (sin *services*). Esta decisión arquitectónica se justifica por:

- **Simplicidad del dominio**: Al tratarse de operaciones CRUD básicas y consultas directas a APIs externas, la lógica de negocio no requiere capas adicionales de abstracción.
- **Tamaño del proyecto**: Dado el *scope* limitado, agregar una capa de servicios introduciría complejidad innecesaria sin beneficios tangibles, especialmente considerando que se trabaja con una base de datos integrada y una API externa para los datos de las películas.
- **Mantenibilidad**: La separación clara entre rutas (definición de *endpoints*) y controladores (lógica de negocio) proporciona suficiente organización para el código actual.
- **Escalabilidad futura**: La estructura permite refactorizar fácilmente hacia un patrón MVC completo si el proyecto creciera en complejidad.

```
EntrevistaTecnicaCodigoDelSur/
├── src/
│   ├── server.js              # Punto de entrada de la aplicación
│   ├── controllers/           # Lógica de negocio
│   │   ├── auth.js           # Registro y login de usuarios
│   │   ├── favorite.js       # Gestión de películas favoritas
│   │   ├── favorite.test.js  # Tests unitarios
│   │   └── movie.js          # Búsqueda de películas en TMDB
│   ├── helpers/              # Utilidades
│   │   ├── authenticator.js  # Middleware de autenticación JWT
│   │   ├── database.js       # Configuración de SQLite
│   │   └── messages.js       # Helper para gestión de mensajes
│   ├── resources/            # Archivos de recursos externos
│   │   └── messages.json     # Mensajes de error y éxito (hot-reload)
│   └── routes/               # Definición de rutas
│       ├── auth.js
│       ├── favorite.js
│       └── movie.js
├── .env                      # Variables de entorno (no versionado)
├── package.json
└── README.md
```

## Requerimientos

- Node.js (versión 14 o superior recomendada)
- npm (incluido con Node.js)

## Instalación 

1) Clona este repositorio en la carpeta deseada

```bash
git clone https://github.com/mauromachadoc/EntrevistaTecnicaCodigoDelSur
```

2) Muévete a la carpeta clonada

```bash
cd EntrevistaTecnicaCodigoDelSur
```

3) Instala las dependencias del proyecto

```bash
npm install
```

4) Crea un archivo `.env` en la carpeta raíz con tu API Key de TheMovieDatabase y una clave secreta para JWT

```env
TMDB_KEY=<tu_bearer_token_de_tmdb>
JWT_SECRET=<tu_clave_secreta>
```

**Importante**: Para obtener el token de TMDB, regístrate en [https://www.themoviedb.org/](https://www.themoviedb.org/) y genera un Bearer Token en la sección de API.

## Ejecución de la API

Inicia el servidor ejecutando:

```bash
npm start
```

La API estará disponible en `http://localhost:3000`

### Endpoints disponibles

- `POST /api/auth/register` - Registrar nuevo usuario
- `POST /api/auth/login` - Iniciar sesión
- `GET /api/movies/search?query=<término>` - Buscar películas en TMDB
- `POST /api/favorites` - Agregar película a favoritos (requiere autenticación)
- `GET /api/favorites` - Obtener películas favoritas del usuario (requiere autenticación)

## Ejecución de Tests Unitarios

Ejecuta la suite de tests con:

```bash
npm test
```

Los tests cubren el controlador de favoritos ([`src/controllers/favorite.js`](src/controllers/favorite.js)) e incluyen casos para:
- Agregar películas favoritas exitosamente
- Manejo de películas duplicadas
- Manejo de películas no disponibles en TMDB (404)
- Validaciones de datos requeridos

## Postman Collection

Se encuentra disponible en la carpeta raíz del proyecto el archivo [`EntrevistaTecnicaCodigoDelSur.postman_collection.json`](EntrevistaTecnicaCodigoDelSur.postman_collection.json) con requests predefinidas a todos los endpoints. 

**Instrucciones de uso**:
1. Importa la colección en Postman
2. Ejecuta los requests en el siguiente orden:
   - Register (crear usuario)
   - Login (obtener token)
   - Copia el token JWT del response
3. Agrega el token manualmente en el header `Authorization` con el formato `Bearer <token>` para los endpoints protegidos
4. Ejecuta Search Movies, Add Favorite y Get Favorites

## Tecnologías utilizadas

- **Node.js & Express**: Framework web
- **SQLite3**: Base de datos relacional
- **JWT (jsonwebtoken)**: Autenticación basada en tokens
- **Bcrypt**: Hash de contraseñas
- **Axios**: Cliente HTTP para consumir TMDB API
- **Jest**: Framework de testing
- **uuid**: Generación de identificadores únicos