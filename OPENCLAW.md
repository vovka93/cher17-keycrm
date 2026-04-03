# OPENCLAW.md

Коротка технічна пам'ятка по проєкту `cher17-keycrm`.

## Що це за проєкт

Це інтеграція сайту з KeyCRM:
- приймає замовлення із сайту через webhook
- кладе їх у Redis-чергу
- створює в KeyCRM або замовлення, або лід
- веде історію обробки в Redis
- має web UI `/history` для перегляду історії
- окремо обробляє фіскалізацію замовлень через webhook + polling

## Поточний стек

- Bun
- Elysia
- Redis
- Docker Compose
- server-rendered React shell для `/history`
- client-side логіка history UI живе в `src/history-app.js`
- KeyCRM OpenAPI через `src/sdk.generated.ts`

## Основні entry points

### Запуск
- `src/index.ts`
- стартує:
  - HTTP сервер
  - `processQueue()` — основний воркер черги замовлень
  - `processFiscalizationQueue()` — воркер фіскалізації

### HTTP сервер
- `src/webhook-server.ts`

Основні routes:
- `POST /webhook` — основний вхідний webhook із сайту
- `POST /fiscalization` — webhook від KeyCRM для фіскалізації
- `GET /history` — HTML history UI
- `GET /history/data` — JSON для UI
- `GET /history/stats`
- `GET /history/:page`
- `GET /history/app.js` — client-side script для UI
- `GET /health` — health + стан черг
- `GET /dlq`
- `POST /dlq/retry`

## Захист `/history`

Увесь `/history*` зараз закритий через Basic Auth.

Поточна логіка:
- env `HISTORY_USERNAME`
- env `HISTORY_PASSWORD`
- fallback за замовчуванням: `dev / dev`

Захищені route-и:
- `/history`
- `/history/data`
- `/history/app.js`
- `/history/:page`
- `/history/stats`
- `/history/clean`

## Як зараз обробляються замовлення із сайту

Головна логіка: `src/queue-service.ts`

### orderStatus / paymentStatus

Очікувана логіка:
- `orderStatus = 0`:
  - `paymentStatus = 1` → створюємо **нове замовлення** в KeyCRM
  - інакше → створюємо **лід**
- `orderStatus = 1` → створюємо **нове замовлення**
- `orderStatus = 2` → **не** синхронізуємо автоматично статус `Sent`
- `orderStatus = 3` → **не** синхронізуємо автоматично статус `Delivered`

### Важливий нюанс по оплаті

Якщо:
- `orderStatus > 1`
- `paymentStatus === 1`

то інтеграція ставить в KeyCRM `status_id = 4`, але **тільки один раз** на замовлення.

Для цього є permanent marker:
- `REDIS_KEYS.ORDER_PAID_STATUS_SYNCED(orderId)`

Сенс:
- якщо менеджер далі руками змінює статус у CRM — інтеграція не має його знову перетирати

## Фіскалізація

Головна логіка: `src/fiscalization-service.ts`
Воркер: `src/fiscalization-worker.ts`

### Що має відбуватись

KeyCRM б'є в:
- `POST /fiscalization`

Логіка така:
1. якщо `status_id !== 2` → ігноруємо
2. якщо `status_id == 2` і `fiscal_status != done` → ставимо замовлення у watch
3. окремий воркер опитує KeyCRM через API
4. коли `fiscal_status == done` і замовлення **все ще** у `status_id == 2` → міняємо на `status_id = 4`
5. повторно те саме замовлення більше не чіпаємо

### Чому так

Бо не можна гарантувати, що KeyCRM пришле другий зручний webhook саме в момент, коли фіскалізація стане `done`.
Тому схема: webhook → watch → poll → move to BAS.

### Основні Redis keys для фіскалізації

- `FISCALIZATION_QUEUE`
- `FISCALIZATION_WATCH(crmOrderId)`
- `FISCALIZATION_DONE(crmOrderId)`
- `FISCALIZATION_RETRY_COUNT(crmOrderId)`
- `FISCALIZATION_RETRY_AT(crmOrderId)`
- `CRM_ORDER_SITE_ORDER_ID(crmOrderId)` — мапа `crm order id -> site order id`

### Важливі правила

- якщо замовлення вже не в `status_id = 2` — watch зупиняється
- якщо вже є marker `done` — повторно не рухаємо
- у history UI це логування видно окремими технічними статусами

## History UI

### Де лежить
- `src/history-ui.tsx` — server-rendered React shell
- `src/history-app.js` — client-side логіка таблиці, фільтрів, details, pagination

### Що вміє UI
- пошук
- фільтрація за статусом
- пагінація
- сортування
- розгортання деталей замовлення
- показ історії статусів
- показ технічних подій фіскалізації

### UI/архітектурний нюанс

Це не окремий Vite/Next фронтенд.
Це server-rendered shell + JS-логіка в поточному Bun/Elysia проєкті.

Тобто:
- вигляд зараз зроблений у shadcn-style
- але без винесення в окремий SPA/frontend app

## Історія замовлень

Сервіс:
- `src/order-mapping-service.ts`

Що робить:
- зберігає order mapping у Redis
- веде `status_history`
- індексує історію для пагінації
- використовує hash/zset структури, а не просто один список

### Важливий нюанс

Було виправлено дублювання `pending` у history.
Тепер повторний enqueue одного й того ж order не повинен без потреби додавати зайві `pending` записи.

## Docker / deploy

### Compose
Файл:
- `docker-compose.yml`

Сервіси:
- `app` → `cher17-webhook`
- `redis` → `cher17-webhook-redis`

Порт:
- `80:3000`

### Environment
Потрібні змінні:
- `KEYCRM_KEY`
- `REDIS_URL`
- опційно:
  - `HISTORY_USERNAME`
  - `HISTORY_PASSWORD`

## Продакшн сервер

Відомий сервер:
- host: `185.233.44.163`
- user: `developer`
- path: `/home/developer/cher17-keycrm`

### SSH ключ
Використовувався ключ:
- `~/.ssh/cher17-developer`

### Звичний deploy flow
На локалці:
- commit
- push в GitHub

На сервері:
- `git checkout main`
- `git pull --ff-only origin main`
- `docker compose -f /home/developer/cher17-keycrm/docker-compose.yml up -d --build`

## Важливі практичні нюанси

### 1. Прод зараз має бути на `main`
Раніше сервер крутився з `feat/history-ui`.
Це вже переводили назад на `main`.
Тримати прод на `main`.

### 2. `/history` не має бути відкритим назовні без auth
Зараз хоча б Basic Auth уже є.
Кращий наступний крок — обмежити ще й по network layer.

### 3. `status_id = 4` — дуже чутливий перехід
У проєкті вже є 2 різні сценарії, які можуть вести до `4`:
- синк paid status один раз для site order
- передача в BAS після `fiscal_status = done`

Перед змінами в цій логіці треба дивитись, який саме business flow мається на увазі.

### 4. History UI використовується як operational console
Тобто це не просто красива сторінка.
Через неї зручно дебажити:
- що прийшло з сайту
- що відповів KeyCRM
- чи пішло у watch
- чи був retry
- чи перевелось у BAS

## Файли, які найчастіше треба читати першими

1. `src/webhook-server.ts`
2. `src/queue-service.ts`
3. `src/order-mapping-service.ts`
4. `src/fiscalization-service.ts`
5. `src/history-ui.tsx`
6. `src/history-app.js`
7. `src/config.ts`
8. `docker-compose.yml`

## Якщо треба швидко зрозуміти систему

Думай про проєкт так:
- **вхід 1:** сайт → `/webhook`
- **вхід 2:** KeyCRM → `/fiscalization`
- **стан:** Redis
- **обробка:** queue worker + fiscalization worker
- **вихід:** створення/оновлення сутностей у KeyCRM
- **спостереження:** `/history`
