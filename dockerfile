# =========================
# Stage 1: build del frontend (React + Vite)
# =========================
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend

# Instalar dependencias del frontend
COPY frontend/package*.json ./
RUN npm install

# Copiar código del frontend y construir
COPY frontend ./
RUN npm run build


# =========================
# Stage 2: backend + estáticos del frontend
# =========================
FROM node:20-alpine

WORKDIR /app

# Copiar package.json del backend
COPY package*.json ./

# Instalar dependencias del backend (express, redis, cors, etc.)
RUN npm install --only=production

# Copiar el código del backend
COPY server.js ./

# Crear carpeta public y copiar el build del frontend ahí
RUN mkdir -p public
COPY --from=frontend-build /app/frontend/dist ./public

# Puerto donde escucha Express
EXPOSE 3000

# Comando de arranque
CMD ["node", "server.js"]
