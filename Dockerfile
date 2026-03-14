# 1. Базовый образ с Node.js
FROM node:18-alpine

# 2. Создаём рабочую директорию
WORKDIR /app

# 3. Копируем package.json и package-lock.json (или yarn.lock)
COPY package*.json ./

# 4. Устанавливаем зависимости
RUN npm ci --omit=dev

# 5. Копируем весь исходный код
COPY . .

# 6. Компилируем TypeScript
RUN npm run build

# 7. Готовим директорию для миграций и сидов
ENV KNEX_MIGRATE_DIR=/app/migrations
ENV KNEX_SEED_DIR=/app/seeds

# 8. Экспонируем порт приложения
EXPOSE 3000

# 9. Запускаем прод-сервер
CMD ["node", "dist/index.js"]
