.PHONY: init dev test lint clean build start start:http start:test start:make railway docker

# Инициализация проекта
init:
	@echo "🚀 Инициализация VKontakte MCP проекта..."
	npm install
	@echo "✅ Проект инициализирован!"

# Установка зависимостей
install:
	@echo "📦 Установка зависимостей..."
	npm ci
	@echo "✅ Зависимости установлены!"

# Сборка проекта
build:
	@echo "🔨 Сборка проекта..."
	npm run build
	@echo "✅ Проект собран!"

# Запуск в режиме разработки
dev:
	@echo "🔄 Запуск в режиме разработки..."
	npm run dev

# Запуск основного MCP сервера
start:
	@echo "🚀 Запуск основного MCP сервера..."
	npm run start

# Запуск HTTP сервера
start:http:
	@echo "🌐 Запуск HTTP сервера..."
	npm run start:http

# Запуск тестового сервера
start:test:
	@echo "🧪 Запуск тестового сервера..."
	npm run start:test

# Запуск Make.com MCP сервера
start:make:
	@echo "🔗 Запуск Make.com MCP сервера..."
	npm run start:make

# Запуск всех тестов
test:
	@echo "🧪 Запуск тестов..."
	npm test

# Проверка кода
lint:
	@echo "🔍 Проверка кода..."
	npm run lint

# Очистка сборки
clean:
	@echo "🧹 Очистка сборки..."
	npm run clean

# Railway развертывание
railway:
	@echo "🚂 Развертывание на Railway..."
	railway up

# Docker сборка и запуск
docker:
	@echo "🐳 Сборка и запуск Docker контейнера..."
	docker build -t mcp-vkontakte .
	docker run -p 3000:3000 --env-file .env mcp-vkontakte

# Docker production
docker:prod:
	@echo "🐳 Сборка production Docker образа..."
	docker build -t mcp-vkontakte:prod .
	docker run -p 3000:3000 --env-file .env.prod mcp-vkontakte:prod

# Тестирование Make.com endpoints
test:make:
	@echo "🧪 Тестирование Make.com endpoints..."
	@echo "📡 SSE endpoint:"
	curl -N http://localhost:3000/mcp/sse
	@echo "\n🔧 API info:"
	curl http://localhost:3000/mcp/info
	@echo "\n🏥 Health check:"
	curl http://localhost:3000/health

# Полная сборка и тест
all: clean install build test:make
	@echo "🎉 Все готово!"

# Помощь
help:
	@echo "📚 Доступные команды:"
	@echo "  init        - Инициализация проекта"
	@echo "  install     - Установка зависимостей"
	@echo "  build       - Сборка проекта"
	@echo "  dev         - Режим разработки"
	@echo "  start       - Запуск основного MCP сервера"
	@echo "  start:http  - Запуск HTTP сервера"
	@echo "  start:test  - Запуск тестового сервера"
	@echo "  start:make  - Запуск Make.com MCP сервера"
	@echo "  test        - Запуск тестов"
	@echo "  lint        - Проверка кода"
	@echo "  clean       - Очистка сборки"
	@echo "  railway     - Развертывание на Railway"
	@echo "  docker      - Docker сборка и запуск"
	@echo "  test:make   - Тестирование Make.com endpoints"
	@echo "  all         - Полная сборка и тест"
	@echo "  help        - Показать эту справку"
