const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.5";
const AGENT_PLATFORM_CHAT_URL = "https://api.agentplatform.ru/v1/chat/completions";
const DEFAULT_AGENT_PLATFORM_MODEL = "openai/gpt-5.4";
const DEFAULT_PROVIDER = "openai";

const SYSTEM_PROMPT = `
Ты AI-аналитик цифрового двойника линии производства порошковой краски.
Отвечай на русском языке, коротко и прикладно. Используй только переданный контекст:
расчетная модель, выбранная историческая смена, эталон, сценарий, завод, рецептура,
энергия, качество, простои и узкие места.

Формат ответа:
1. Сначала прямой вывод.
2. Затем 2-4 конкретных действия или проверки.
3. Если данных недостаточно, прямо скажи, какие поля нужны.

Не выдумывай паспортные значения оборудования, реальные причины простоев или фактические
показатели, которых нет в контексте.
`;

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function extractText(data) {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const chunks = [];
  for (const item of data.output || []) {
    for (const part of item.content || []) {
      if (typeof part.text === "string") chunks.push(part.text);
      if (typeof part.value === "string") chunks.push(part.value);
    }
  }

  return chunks.join("\n").trim();
}

function extractAgentText(data) {
  if (typeof data === "string") return data.trim();
  if (!data || typeof data !== "object") return "";

  const direct = [
    data.answer,
    data.output,
    data.result,
    data.message,
    data.text,
    data.content,
    data.response,
    data.data?.answer,
    data.data?.output,
    data.data?.message,
    data.data?.text,
  ];

  for (const value of direct) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  const choice = data.choices?.[0]?.message?.content || data.choices?.[0]?.text;
  if (typeof choice === "string" && choice.trim()) return choice.trim();

  return extractText(data);
}

function normalizeProvider() {
  const configured = String(process.env.AI_PROVIDER || "").toLowerCase().trim();
  if (["agent", "agent_platform", "agentplatform"].includes(configured)) return "agent_platform";
  if (configured === "openai") return "openai";

  const openAiKey = process.env.OPENAI_API_KEY || "";
  if (
    process.env.AGENT_PLATFORM_API_KEY ||
    process.env.AGENT_PLATFORM_API_URL ||
    process.env.AGENT_PLATFORM_BASE_URL ||
    openAiKey.startsWith("sk-ap-")
  ) {
    return "agent_platform";
  }

  return DEFAULT_PROVIDER;
}

function resolveApiKey(provider) {
  if (provider === "agent_platform") {
    if (process.env.AGENT_PLATFORM_API_KEY) {
      return { value: process.env.AGENT_PLATFORM_API_KEY, source: "AGENT_PLATFORM_API_KEY" };
    }
    if (process.env.OPENAI_API_KEY) {
      return { value: process.env.OPENAI_API_KEY, source: "OPENAI_API_KEY" };
    }
    return { value: "", source: null };
  }

  if (process.env.OPENAI_API_KEY) {
    return { value: process.env.OPENAI_API_KEY, source: "OPENAI_API_KEY" };
  }
  return { value: "", source: null };
}

function resolveAgentPlatformUrl() {
  const explicit = process.env.AGENT_PLATFORM_API_URL || process.env.AGENT_PLATFORM_URL;
  if (explicit) return explicit;

  const base = process.env.AGENT_PLATFORM_BASE_URL || process.env.OPENAI_BASE_URL;
  if (base) return `${base.replace(/\/+$/, "")}/v1/chat/completions`;

  return AGENT_PLATFORM_CHAT_URL;
}

function keyStatus(apiKey, source, provider) {
  if (!apiKey) return { ok: false, type: "missing", source };
  if (provider === "agent_platform") {
    return { ok: true, type: apiKey.startsWith("sk-ap-") ? "agent-platform-key" : "api-key", source };
  }
  if (apiKey.startsWith("sk-ap-")) return { ok: false, type: "agent-platform-key", source };
  return { ok: true, type: apiKey.startsWith("sk-proj-") ? "openai-project-key" : "openai-key", source };
}

function sanitizeError(message = "") {
  return String(message)
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-***")
    .slice(0, 900);
}

function upstreamDiagnostic(status, data, model) {
  const error = data?.error || {};
  return {
    status,
    model,
    code: error.code || error.type || "openai_error",
    message: sanitizeError(error.message || "OpenAI request failed"),
  };
}

function userFacingAiError(diagnostic) {
  if (diagnostic.provider === "agent_platform") {
    if (diagnostic.status === 401 || diagnostic.status === 403) {
      return [
        "AgentPlatform отклонил запрос авторизации.",
        "Проверьте AGENT_PLATFORM_API_KEY, endpoint AgentPlatform и права ключа. Ключ должен лежать только в Vercel Environment Variables.",
      ].join("\n\n");
    }

    return [
      "AgentPlatform не ответил на запрос цифрового двойника.",
      `Диагностика: ${diagnostic.status} / ${diagnostic.code}. Проверьте AGENT_PLATFORM_API_URL и формат payload для вашего агента.`,
    ].join("\n\n");
  }

  if (diagnostic.status === 401) {
    return [
      "OpenAI отклонил ключ API. В Vercel нужно заменить OPENAI_API_KEY на ключ из OpenAI Platform API keys.",
      "Текущий ключ не подходит для Responses API или был отозван. После замены переменной сделайте redeploy проекта.",
    ].join("\n\n");
  }

  if (diagnostic.status === 403) {
    return [
      "Ключ OpenAI принят, но у него нет доступа к выбранной модели или проекту.",
      `Проверьте доступ к модели ${diagnostic.model} или временно укажите доступную модель в OPENAI_MODEL.`,
    ].join("\n\n");
  }

  if (diagnostic.status === 404 || /model/i.test(diagnostic.message)) {
    return [
      `Модель ${diagnostic.model} недоступна для текущего ключа OpenAI.`,
      "Проверьте OPENAI_MODEL в Vercel Environment Variables или оставьте переменную пустой, чтобы использовать модель по умолчанию проекта.",
    ].join("\n\n");
  }

  if (diagnostic.status === 429) {
    return [
      "OpenAI ограничил запрос: исчерпан лимит, квота или включено rate limit ограничение.",
      "Проверьте billing, usage limits и лимиты проекта OpenAI.",
    ].join("\n\n");
  }

  return [
    "ИИ-сервис не ответил. Сервер цифрового двойника получил ошибку от OpenAI.",
    `Диагностика: ${diagnostic.status} / ${diagnostic.code}.`,
  ].join("\n\n");
}

function compactContext(body) {
  return JSON.stringify(twinContext(body), null, 2).slice(0, 18000);
}

function twinContext(body) {
  return {
    question: body.question,
    factory: body.factory,
    recipe: body.recipe,
    model: body.model,
    actual: body.actual,
    scenario: body.scenario,
    etalon: body.etalon,
    history: Array.isArray(body.history) ? body.history.slice(0, 12) : [],
  };
}

function buildUserInput(body) {
  return [
    `Вопрос пользователя: ${body.question || ""}`,
    "Контекст цифрового двойника:",
    compactContext(body),
  ].join("\n\n");
}

function responsesPayload(model, userInput, includeOpenAiOptions = false) {
  const payload = {
    model,
    instructions: SYSTEM_PROMPT,
    input: userInput,
    max_output_tokens: 900,
  };

  if (includeOpenAiOptions) {
    payload.reasoning = { effort: "low" };
    payload.text = { verbosity: "medium" };
  }

  return payload;
}

function agentPayloadMode(endpoint = "") {
  const configured = String(process.env.AGENT_PLATFORM_PAYLOAD_MODE || "").toLowerCase().trim();
  if (configured) return configured;
  return endpoint.includes("/chat/completions") ? "chat" : "generic";
}

function agentPayload(body, model, userInput, endpoint) {
  const mode = agentPayloadMode(endpoint);
  if (mode === "responses") return responsesPayload(model, userInput, false);

  if (mode === "chat") {
    return {
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userInput },
      ],
    };
  }

  return {
    model,
    question: body.question || "",
    input: userInput,
    instructions: SYSTEM_PROMPT,
    context: twinContext(body),
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userInput },
    ],
    metadata: {
      app: "PowderTwin",
      domain: "powder-coating-line-digital-twin",
      factory: body.factory?.name,
      recipe: body.recipe?.name,
    },
  };
}

async function callOpenAi(apiKey, model, body) {
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(responsesPayload(model, buildUserInput(body), true)),
  });

  const data = await response.json().catch(() => ({}));
  return { response, data, answer: extractText(data), endpoint: OPENAI_RESPONSES_URL };
}

async function callAgentPlatform(apiKey, model, body) {
  const endpoint = resolveAgentPlatformUrl();
  if (!endpoint) {
    const error = new Error("AGENT_PLATFORM_API_URL is not configured");
    error.statusCode = 503;
    error.code = "missing_agent_platform_url";
    throw error;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(agentPayload(body, model, buildUserInput(body), endpoint)),
  });

  const data = await response.json().catch(() => ({}));
  return { response, data, answer: extractAgentText(data), endpoint };
}

module.exports = async function handler(req, res) {
  const provider = normalizeProvider();
  const resolvedKey = resolveApiKey(provider);
  const apiKey = resolvedKey.value;
  const key = keyStatus(apiKey, resolvedKey.source, provider);
  const model = provider === "agent_platform"
    ? process.env.AGENT_PLATFORM_MODEL || DEFAULT_AGENT_PLATFORM_MODEL
    : process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const endpoint = provider === "agent_platform" ? resolveAgentPlatformUrl() : OPENAI_RESPONSES_URL;

  if (req.method === "GET") {
    return sendJson(res, 200, {
      ready: key.ok && (provider === "openai" || Boolean(endpoint)),
      provider,
      keyType: key.type,
      keyEnv: key.source,
      model,
      endpoint,
      payloadMode: provider === "agent_platform" ? agentPayloadMode(endpoint) : "responses",
      hint: key.ok && (provider === "openai" || Boolean(endpoint))
        ? "AI endpoint is configured. Use POST with the twin context."
        : provider === "agent_platform"
          ? "Add AGENT_PLATFORM_API_URL or AGENT_PLATFORM_BASE_URL in Vercel Environment Variables."
          : "Add a valid OpenAI Platform API key to OPENAI_API_KEY in Vercel Environment Variables.",
    });
  }

  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Only POST is supported" });
  }

  if (key.type === "missing") {
    return sendJson(res, 503, {
      error: "AI key is not configured",
      answer: provider === "agent_platform"
        ? "ИИ пока работает в offline preview. Добавьте AGENT_PLATFORM_API_KEY в Vercel Environment Variables и сделайте redeploy проекта."
        : "ИИ пока работает в offline preview. Добавьте OPENAI_API_KEY в Vercel Environment Variables и сделайте redeploy проекта.",
      diagnostic: { status: 503, provider, keyType: key.type, keyEnv: key.source, model },
    });
  }

  if (provider === "openai" && key.type === "agent-platform-key") {
    const keyName = key.source || "OPENAI_API_KEY";
    return sendJson(res, 401, {
      error: "The configured key has sk-ap prefix and is not accepted by OpenAI Responses API.",
      answer: `В Vercel сейчас переменная ${keyName} содержит ключ формата sk-ap-..., а этот endpoint вызывает OpenAI Responses API. Нужен OpenAI Platform API key, обычно формата sk-proj-..., в переменной OPENAI_API_KEY. После замены сделайте redeploy.`,
      diagnostic: { status: 401, provider, keyType: key.type, keyEnv: key.source, model },
    });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const result = provider === "agent_platform"
      ? await callAgentPlatform(apiKey, model, body)
      : await callOpenAi(apiKey, model, body);

    const { response, data, answer } = result;
    if (!response.ok) {
      const diagnostic = upstreamDiagnostic(response.status, data, model);
      diagnostic.provider = provider;
      diagnostic.endpoint = result.endpoint;
      return sendJson(res, response.status, {
        error: diagnostic.message,
        answer: userFacingAiError(diagnostic),
        diagnostic,
      });
    }

    return sendJson(res, 200, {
      answer: answer || "ИИ вернул пустой ответ. Попробуйте уточнить вопрос.",
      model,
      provider,
      responseId: data.id,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return sendJson(res, status, {
      error: error.message,
      answer: provider === "agent_platform" && error.code === "missing_agent_platform_url"
        ? "Ключ AgentPlatform найден, но не указан endpoint. Добавьте AGENT_PLATFORM_API_URL или AGENT_PLATFORM_BASE_URL в Vercel Environment Variables и сделайте redeploy."
        : "Не удалось обработать запрос к ИИ. Проверьте формат данных и переменные окружения.",
      diagnostic: { status, provider, keyEnv: key.source, model, code: error.code || "handler_error" },
    });
  }
};
