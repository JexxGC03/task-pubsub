# Demo Publish–Subscribe: Tareas en tiempo real

> 🔌 **Objetivo:** mostrar de forma sencilla y visual cómo funciona el patrón  
> **Publish–Subscribe (pub/sub)** usando **Node.js + Redis + React** y cómo
> correr todo el sistema en cualquier máquina usando **Docker**.

---

## 0. TL;DR – Cómo correrlo con Docker en 3 comandos

```bash
# 1. Clonar el repositorio
git clone <URL-DEL-REPO>
cd tasks-pubsub-demo

# 2. Construir y levantar app + Redis
docker compose up --build
# o en versiones viejas:
# docker-compose up --build

# 3. Abrir en el navegador
http://localhost:3000
```

Abre **dos pestañas** con esa URL, crea/cambia tareas en una pestaña y verás
cómo **se sincronizan en tiempo real** en la otra gracias al pub/sub.

---

## 1. ¿Qué es esta demo?

Es una aplicación sencilla de “tareas” (tipo TODO/Kanban) diseñada para:

- Mostrar cuál es el rol de:
  - un **publisher** (quien emite eventos),
  - un **broker de mensajes** (Redis),
  - y varios **subscribers** (los clientes).
- Ver en vivo cómo los cambios en una instancia de la app afectan a las demás.
- Servir como base para explicar pub/sub en una presentación de curso.

### 1.1. Historias de usuario básicas

- Como usuario, quiero **crear tareas** indicando título y estado inicial (`TODO`, `DOING` o `DONE`).
- Como usuario, quiero **cambiar el estado de una tarea** y que el cambio
  aparezca instantáneamente en las demás pestañas.
- Como docente/estudiante, quiero **ver los eventos pub/sub en un log**
  para explicar el flujo de mensajes.

---

## 2. Stack tecnológico

- **Backend**
  - Node.js + Express
  - Server-Sent Events (SSE) para enviar eventos al navegador
  - Redis client (`redis@4`) como publisher y subscriber
- **Broker de mensajería**
  - Redis (modo pub/sub, canal `tasks_updates`)
- **Frontend**
  - React + Vite
  - `fetch` para llamadas REST
  - `EventSource` (SSE) para recibir eventos en tiempo real
- **Infraestructura**
  - Dockerfile multi-stage:
    - Stage 1: build del front (React/Vite).
    - Stage 2: backend Node sirviendo el build del front.
  - Docker Compose:
    - Servicio `app` (backend + frontend estático).
    - Servicio `redis` (broker de mensajes).

---

## 3. Arquitectura y patrón Publish–Subscribe

### 3.1. Diagrama lógico (simplificado)

```text
+---------------------------+        +-----------------+
|        Navegador A        |        |   Navegador B   |
|  React + EventSource      |        | React + SSE     |
|  /tasks  /events          |        | /tasks /events  |
+------------^--------------+        +---------^-------+
             |                                |
             | SSE (eventos)                  | SSE (eventos)
             |                                |
        +----+--------------------------------+------+
        |      Backend Node.js + Express              |
        |  - Endpoints REST (/tasks, /tasks/:id)      |
        |  - Endpoint SSE (/events)                  |
        |  - Publisher y Subscriber de Redis         |
        +--------------------^-----------------------+
                             |
                             | Pub/Sub (canal tasks_updates)
                             v
                      +-----------------+
                      |      Redis      |
                      |   Broker PubSub |
                      +-----------------+
```

### 3.2. Flujo de creación de tarea (caso típico)

1. El usuario en el navegador A envía un `POST /tasks` con `{ title, status }`.
2. El backend:
   - Guarda la tarea en la “BD” en memoria.
   - Construye un evento:

     ```json
     {
       "type": "TASK_CREATED",
       "task": { "id": 1, "title": "Tarea X", "status": "TODO", "createdAt": "..." }
     }
     ```

   - Publica el evento en Redis:

     ```js
     await redisPublisher.publish('tasks_updates', JSON.stringify(event));
     ```

3. Redis, como broker, recibe el mensaje en el canal `tasks_updates` y se lo
   envía a todos los **subscribers** de ese canal.
4. El backend, que también está suscrito a `tasks_updates`, recibe el mensaje:

   ```js
   await redisSubscriber.subscribe('tasks_updates', (message) => {
     const event = JSON.parse(message);
     sendEventToAll(event); // SSE
   });
   ```

5. `sendEventToAll` envía el evento por **SSE** a todos los navegadores conectados al endpoint `/events`.
6. Cada navegador (A, B, C, ...) recibe el evento vía `EventSource`, actualiza
   su estado local (`setTasks`) y vuelve a renderizar la UI.

> **Idea clave:** el publisher no sabe cuántos clientes hay ni quién los recibe.
> Solo publica en un canal. Eso es **publish–subscribe**.

---

## 4. Estructura del proyecto

```text
tasks-pubsub-demo/
├─ server.js              # Backend Node + Express + Redis + SSE
├─ package.json           # Dependencias backend + scripts
├─ Dockerfile             # Imagen multi-stage (frontend build + backend)
├─ docker-compose.yml     # Orquestación app + Redis
└─ frontend/              # Proyecto React + Vite
   ├─ package.json
   └─ src/
      ├─ main.jsx
      └─ App.jsx         # UI, lógica de llamadas REST y SSE
```

---

## 5. Cómo correrlo con Docker (modo “portable”)

Esta es la forma recomendada para demostrar el proyecto en cualquier equipo
que tenga **Docker** y (opcionalmente) Docker Compose.

### 5.1. Prerrequisitos

- Docker Desktop / Docker Engine instalado.
- `docker compose` disponible (o el comando clásico `docker-compose`).

### 5.2. Construir y levantar los servicios

Desde la raíz del proyecto (`tasks-pubsub-demo/`):

```bash
# Construir imagen de la app y levantar app + Redis
docker compose up --build
# o:
# docker-compose up --build
```

Esto:

- Construye una imagen de Node (`app`) que:
  - En el stage 1 compila el frontend de React con Vite.
  - En el stage 2 copia el `dist/` generado a `/app/public` y levanta Express.
- Levanta un contenedor de Redis (`redis:7-alpine`).
- Conecta ambos contenedores en una red interna, usando `REDIS_HOST=redis`.

### 5.3. Acceder a la aplicación

Una vez que Docker termine de levantar todo:

- Abrir en el navegador:

  ```text
  http://localhost:3000
  ```

- Deberías ver la UI de la demo de tareas.

### 5.4. Probar el comportamiento pub/sub

1. Abre **dos pestañas** en `http://localhost:3000`.
2. En la pestaña 1:
   - Escribe un título (ej. “Preparar informe de SO”).
   - Elige estado `TODO` o `DOING`.
   - Haz clic en **Crear**.
3. Observa:
   - La tarea aparece en la pestaña 1.
   - La **misma tarea aparece automáticamente en la pestaña 2**.
4. En la pestaña 2:
   - Cambia el estado de la tarea usando el `<select>` (`TODO/DOING/DONE`).
5. Observa:
   - La pestaña 1 se actualiza sola con el nuevo estado.

### 5.5. Ver logs de contenedores

En la consola donde ejecutaste `docker compose up` se verán los logs de ambos servicios:

- Logs de la app (`app`) incluyendo:
  - `✅ Conectado a Redis`
  - `📩 Evento desde Redis: { ... }`
- Logs del contenedor `redis`.

Para verlos por separado:

```bash
docker compose logs app
docker compose logs redis
```

### 5.6. Detener y limpiar

```bash
# Detener contenedores
docker compose down
# o docker-compose down
```

Si quieres borrar también las imágenes (opcional):

```bash
docker rmi tasks-pubsub-demo_app
# el nombre exacto depende del proyecto/compose
```

---

## 6. Cómo correrlo en modo desarrollo (sin Docker para la app)

Si quieres modificar código y tener recarga rápida en dev:

### 6.1. Prerrequisitos

- Node.js v18+ (o similar).
- Docker (solo para levantar Redis, si no lo quieres instalar nativo).

### 6.2. Backend + Redis

1. Instalar dependencias del backend:

   ```bash
   npm install
   ```

2. Levantar Redis (en modo contenedor, **solo broker**):

   ```bash
   docker run -d --name redis-pubsub -p 6379:6379 redis:7-alpine
   ```

3. Asegúrate de que tu `server.js` usa por defecto:

   ```js
   const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
   const REDIS_PORT = process.env.REDIS_PORT || 6379;
   ```

4. Levantar el backend:

   ```bash
   npm run dev
   # Esperas ver: "✅ Conectado a Redis" y "🚀 Servidor escuchando en http://localhost:3000"
   ```

### 6.3. Frontend (React + Vite)

1. Instalar dependencias del frontend:

   ```bash
   cd frontend
   npm install
   ```

2. (Opcional) Para desarrollo, puedes fijar:

   ```js
   // en App.jsx:
   const API_URL = "http://localhost:3000";
   ```

3. Levantar Vite:

   ```bash
   npm run dev
   # Vite normalmente arranca en http://localhost:5173
   ```

4. Abrir `http://localhost:5173` en dos pestañas y probar la demo igual que antes.

---

## 7. Uso de la app: UI y API

### 7.1. UI (desde el lado del usuario)

- **Formulario crear tarea**
  - Campo de texto: título de la tarea.
  - `<select>` para el estado inicial.
  - Botón **Crear**.
- **Lista de tareas**
  - Muestra cada tarea como:
    - Título
    - Estado actual `[TODO/DOING/DONE]`
  - Incluye un `<select>` por tarea para cambiar el estado.
- **Log de eventos SSE (opcional, según la versión de App.jsx)**
  - Lista cronológica de mensajes recibidos por EventSource.
  - Útil para enseñar qué JSON se está enviando en pub/sub.

### 7.2. API REST (para Postman/cURL)

Por defecto, con la app en Docker, la base es `http://localhost:3000`.

#### `GET /tasks`

Lista todas las tareas:

```bash
curl http://localhost:3000/tasks
```

Respuesta:

```json
[
  {
    "id": 1,
    "title": "Ejemplo",
    "status": "TODO",
    "createdAt": "2025-01-01T12:00:00.000Z"
  }
]
```

#### `POST /tasks`

Crea una nueva tarea:

```bash
curl -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Nueva tarea","status":"DOING"}'
```

#### `PATCH /tasks/:id`

Actualiza el estado de una tarea:

```bash
curl -X PATCH http://localhost:3000/tasks/1 \
  -H "Content-Type: application/json" \
  -d '{"status":"DONE"}'
```

#### `GET /events` (SSE)

Es el endpoint que usan los navegadores con `EventSource`.  
Si lo pruebas con `curl`, verás algo como:

```bash
curl http://localhost:3000/events
```

Y se quedará “colgado” mostrando las líneas SSE que vayan llegando.

---

## 8. Configuración y variables de entorno

El backend soporta:

- `PORT` – Puerto HTTP donde escucha Express.  
  Por defecto: `3000`.

- `REDIS_HOST` – Hostname/IP de Redis.  
  Por defecto: `127.0.0.1`.

- `REDIS_PORT` – Puerto de Redis.  
  Por defecto: `6379`.

En `docker-compose.yml` se configura así:

```yaml
services:
  app:
    environment:
      REDIS_HOST: redis
      REDIS_PORT: 6379
```

---

## 9. Puntos clave para explicar en clase

- **Desacoplamiento:**  
  El cliente que crea una tarea no llama directamente a los demás clientes.
  Solo manda un evento al servidor, que a su vez publica en Redis.  
  Cualquier subscriber nuevo (otro servicio, otra app) puede conectarse al canal
  `tasks_updates` sin cambiar el código del publisher.

- **Redis como broker pub/sub:**  
  - Canal lógico: `tasks_updates`.
  - Publisher: backend cuando ejecuta `publish`.
  - Subscriber: backend suscrito al canal, y potencialmente otros servicios.

- **SSE vs WebSocket:**  
  - SSE es un canal **unidireccional** (servidor → cliente).
  - Suficiente para este caso, donde las acciones del cliente viajan por HTTP/REST
    y las notificaciones vuelven como eventos.

- **Dockerización:**  
  - Un solo comando (`docker compose up --build`) levanta:
    - App (backend + frontend build).
    - Redis.
  - Cualquier máquina con Docker puede correr la demo sin instalar Node ni Redis.

---

## 10. Errores comunes y solución rápida

- **`ECONNREFUSED` conectando a Redis**
  - Verifica que Redis esté corriendo:
    - En modo Docker Compose: `docker compose ps`.
    - En modo desarrollo: `docker ps` y que exista el contenedor `redis-pubsub`.
  - Verifica `REDIS_HOST` y `REDIS_PORT`.

- **`docker compose` no existe**
  - Prueba con `docker-compose`.
  - Si tampoco existe, actualiza Docker Desktop o instala el plugin de Compose.

- **La app no abre en el navegador**
  - Comprueba que el puerto 3000 no esté ocupado por otro proceso.
  - Con `docker compose ps` revisa si el servicio `app` está `Up`.

---

> Con este README deberías poder:
>
> - Entender la arquitectura de la demo.
> - Correrla rápidamente con Docker en cualquier máquina.
> - Mostrar en vivo el patrón **Publish–Subscribe** usando Redis + SSE.
> - Defender el diseño y el código en una presentación académica.
