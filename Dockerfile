FROM node:18-alpine AS builder

WORKDIR /app

# Копирование файлов зависимостей
COPY package*.json ./
COPY tsconfig.json ./

# Установка зависимостей
RUN npm ci --only=production

# Копирование исходного кода
COPY src/ ./src/

# Сборка приложения
RUN npm run build

# Продакшн образ
FROM node:18-alpine AS production

WORKDIR /app

# Установка только продакшн зависимостей
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Копирование собранного приложения
COPY --from=builder /app/dist ./dist

# Создание пользователя для безопасности
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Изменение владельца файлов
RUN chown -R nodejs:nodejs /app
USER nodejs

# Открытие порта
EXPOSE 3000

# Проверка здоровья
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Запуск приложения
CMD ["npm", "run", "start:http"]
