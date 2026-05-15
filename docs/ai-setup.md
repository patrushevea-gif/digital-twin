# Подключение AI Agent к PowderTwin

## Где хранить API ключ

Ключ OpenAI / AgentPlatform нельзя хранить в HTML, JavaScript-файлах, GitHub, localStorage
или прямо в браузере. Для Vercel ключ должен лежать в переменных окружения проекта.

## Режим 1: подключение через AgentPlatform

Это основной режим для текущего MVP, если ИИ у вас подключается не прямым ключом OpenAI,
а через AgentPlatform.

В Vercel:

1. Открыть проект `digital-twin`.
2. Перейти в `Settings` -> `Environment Variables`.
3. Добавить переменные:
   - `AI_PROVIDER` = `agent_platform`.
   - `AGENT_PLATFORM_API_KEY` = ваш ключ AgentPlatform, например формата `sk-ap-...`.
4. Endpoint AgentPlatform уже задан в коде по умолчанию:
   - `https://api.agentplatform.ru/v1/chat/completions`.
5. Если endpoint изменится, можно переопределить его переменной:
   - `AGENT_PLATFORM_API_URL` = полный endpoint AgentPlatform.
6. Если AgentPlatform дает только base URL, можно вместо полного endpoint указать:
   - `AGENT_PLATFORM_BASE_URL` = base URL, а система добавит `/v1/chat/completions`.
7. Формат payload по умолчанию уже `chat`, как в примере AgentPlatform:
   - `POST /v1/chat/completions`
   - `messages: [{ role, content }]`
8. Модель по умолчанию:
   - `AGENT_PLATFORM_MODEL` = `openai/gpt-5.4`.
9. Выбрать окружения `Production`, `Preview`, `Development` по необходимости.
10. Нажать `Save`.
11. Сделать redeploy последнего деплоя или новый push в `main`.

Если `sk-ap-...` уже лежит в `OPENAI_API_KEY`, bridge автоматически переключится
в режим AgentPlatform. Но для порядка лучше перенести такой ключ в
`AGENT_PLATFORM_API_KEY`, чтобы по названию переменной было понятно, какой провайдер
используется.

Что делает `/api/ai` в этом режиме:

- принимает вопрос и текущий контекст цифрового двойника из браузера;
- отправляет их на AgentPlatform с серверной стороны;
- поддерживает ключи `sk-ap-...`;
- по умолчанию вызывает `https://api.agentplatform.ru/v1/chat/completions`;
- по умолчанию использует модель `openai/gpt-5.4`;
- умеет читать типовые ответы вида `answer`, `output`, `message`, `text`,
  `choices[0].message.content` и `output_text`;
- `GET /api/ai` показывает диагностику: провайдер, найденную переменную ключа,
  endpoint и payload mode, не раскрывая сам ключ.

## Режим 2: прямое подключение к OpenAI

Этот режим нужен только если вы хотите обращаться напрямую к OpenAI Responses API,
без AgentPlatform.

В Vercel:

1. Добавить переменную:
   - `AI_PROVIDER` = `openai`.
   - `OPENAI_API_KEY` = ключ из OpenAI Platform API keys, обычно формата `sk-proj-...`.
2. Рекомендуемо добавить модель:
   - `OPENAI_MODEL` = `gpt-5.5`.
3. Выбрать окружения `Production`, `Preview`, `Development` по необходимости.
4. Нажать `Save`.
5. Сделать redeploy последнего деплоя или новый push в `main`.

## Что уже подготовлено в проекте

- `/api/ai` - серверная Vercel Function, которая работает как AI bridge:
  AgentPlatform или прямой OpenAI.
- `apps/web/ai-bridge.js` - фронтенд-мост, который отправляет вопрос и текущий контекст
  цифрового двойника на `/api/ai`.
- Если ключ не настроен или API недоступен, интерфейс остается в offline preview и дает
  локальный ответ по расчетной модели.
- `GET /api/ai` - быстрая диагностика: показывает, видит ли сервер ключ и какую модель
  использует, без раскрытия самого ключа.

## Почему ключ не должен быть во фронтенде

Все, что попадает в HTML/JS, может увидеть любой посетитель сайта через DevTools или исходный код.
Даже если репозиторий приватный, ключ внутри фронтенда все равно попадет в браузер пользователя.
Поэтому ключ должен быть только на серверной стороне: Vercel Environment Variables -> Vercel Function -> AgentPlatform или OpenAI API.

## Рекомендуемая модель

Для текущего MVP через AgentPlatform используем `openai/gpt-5.4`, потому что именно такое
имя модели указано в документации AgentPlatform для chat completions.

Для более глубокого анализа, когда появятся реальные исторические данные, можно протестировать:

- `openai/gpt-5.4` - основной режим MVP;
- более сильную модель AgentPlatform, если она появится в списке доступных;
- более легкую модель AgentPlatform для дешевой проверки CSV/Excel и классификации простоев.
