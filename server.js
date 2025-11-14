const express = require('express');
const cors = require('cors');
const redis = require('redis');
const path = require('path');

const app = express();
const PORT = 3000;

// Config Redis (permite usarlo local o en Docker)
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const REDIS_URL = `redis://${REDIS_HOST}:${REDIS_PORT}`;


// ====== Middleware ======
app.use(cors());
app.use(express.json());

// Servir archivos estáticos (frontend) desde /public
app.use(express.static(path.join(__dirname, 'public')));

// ====== "Base de datos" en memoria ======
let tasks = [];
let nextId = 1;

// ====== SSE: gestión de clientes conectados ======
let sseClients = [];

function sendEventToAll(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(client => client.res.write(payload));
}

// Endpoint SSE (suscripción de navegadores)
app.get('/events', (req, res) => {
  // Cabeceras SSE
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  res.flushHeaders();

  // Opcional: cuánto reintentar en caso de desconexión
  res.write('retry: 10000\n\n');

  const clientId = Date.now();
  const newClient = { id: clientId, res };
  sseClients.push(newClient);

  console.log(`🟢 Cliente SSE conectado: ${clientId}`);

  req.on('close', () => {
    console.log(`🔴 Cliente SSE desconectado: ${clientId}`);
    sseClients = sseClients.filter(c => c.id !== clientId);
  });
});

// ====== Endpoints REST para tareas ======

// Obtener todas las tareas
app.get('/tasks', (req, res) => {
  res.json(tasks);
});

// Crear una tarea nueva (Publisher)
app.post('/tasks', async (req, res) => {
  const { title, status } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'title es obligatorio' });
  }

  const task = {
    id: nextId++,
    title,
    status: status || 'TODO',
    createdAt: new Date().toISOString(),
  };

  tasks.push(task);

  // Publicar evento en Redis
  const event = { type: 'TASK_CREATED', task };
  await redisPublisher.publish('tasks_updates', JSON.stringify(event));

  res.status(201).json(task);
});

// Actualizar el estado de una tarea (Publisher)
app.patch('/tasks/:id', async (req, res) => {
  const taskId = Number(req.params.id);
  const { status } = req.body;

  const task = tasks.find(t => t.id === taskId);
  if (!task) {
    return res.status(404).json({ error: 'Task no encontrada' });
  }

  if (!status) {
    return res.status(400).json({ error: 'status es obligatorio' });
  }

  task.status = status;

  const event = { type: 'TASK_UPDATED', task };
  await redisPublisher.publish('tasks_updates', JSON.stringify(event));

  res.json(task);
});

// ====== Configurar Redis (Publisher & Subscriber) ======
const redisPublisher = redis.createClient({ url: REDIS_URL });
const redisSubscriber = redis.createClient({ url: REDIS_URL });


redisPublisher.on('error', (err) => console.error('Redis Publisher error', err));
redisSubscriber.on('error', (err) => console.error('Redis Subscriber error', err));

async function start() {
  // Conectar a Redis
  await redisPublisher.connect();
  await redisSubscriber.connect();

  console.log('✅ Conectado a Redis');

  // Suscribirse al canal de actualizaciones de tareas
  await redisSubscriber.subscribe('tasks_updates', (message) => {
    const event = JSON.parse(message);
    console.log('📩 Evento desde Redis:', event);

    // Enviar evento a todos los clientes SSE conectados
    sendEventToAll(event);
  });

  // Levantar el servidor HTTP
  app.listen(PORT, () => {
    console.log(`🚀 Servidor escuchando en http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Error al iniciar la app:', err);
  process.exit(1);
});
