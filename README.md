Скопировать шаблон переменных окружения

cp example.env .env

И откройте .env, чтобы указать свои данные:

dotenv

DB_HOST = host
DB_PORT = db host
DB_USER = your_mysql_user
DB_PASSWORD = your_mysql_password
DB_NAME = db name
JWT_SECRET = ...
JWT_EXPIRES_IN = 1h
NODE_ENV = development

Установить зависимости

bash

npm install
npx knex migrate:latest
npx knex seed:run
npm run dev

📦 Скрипты
npm run dev — запуск в режиме разработки (с горячей перезагрузкой).

npx knex migrate:latest — применить все миграции.

npx knex seed:run — выполнить все сиды.

npm test — запустить тесты (если настроены).

🔑 Авторизация
Зарегистрируйтесь через
POST /api/users/signup

Войдите через
POST /api/users/login
и получите JWT-токен.

Передавайте токен в заголовке
Authorization: Bearer <ваш_токен>

📚 Документация по эндпоинтам
Все эндпоинты находятся под префиксом /api:

Auth:

POST /users/signup

POST /users/login

POST /users/logout

GET|PUT|DELETE /users/profile

Admin (только для local_admin и super_admin):

GET /users

GET /users/:id

PUT /users/:id

DELETE /users/:id

POST /users/assign-role

Districts:

GET /districts

POST /districts

PUT /districts/:id

DELETE /districts/:id

Categories:

GET /categories

GET /categories/:id

POST /categories

PUT /categories/:id

DELETE /categories/:id

Directions:

GET /dir

GET /dir/:id

POST /dir

PUT /dir/:id

DELETE /dir/:id

Working Hours:

GET /working-hours

GET /working-hours/:id

POST /working-hours

PUT /working-hours/:id

DELETE /working-hours/:id

Sessions:

GET /sessions

POST /sessions

PATCH /sessions/:id/complete

PATCH /sessions/:id/cancel

PATCH /sessions/:id/change-status

Notification:

GET /notification/:id/read

PUT /notification
