const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.5";

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

function keyStatus(apiKey) {
  if (!apiKey) return { ok: false, type: "missing" };
  if (apiKey.startsWith("sk-ap-")) return { ok: false, type: "agent-platform-key" };
  return { ok: true, type: apiKey.startsWith("sk-proj-") ? "openai-project-key" : "openai-key" };
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
  const allowed = {
    question: body.question,
    factory: body.factory,
    recipe: body.recipe,
    model: body.model,
    actual: body.actual,
    scenario: body.scenario,
    etalon: body.etalon,
    history: Array.isArray(body.history) ? body.history.slice(0, 12) : [],
  };

  return JSON.stringify(allowed, null, 2).slice(0, 18000);
}

module.exports = async function handler(req, res) {
  const apiKey = process.env.OPENAI_API_KEY || process.env.AGENT_PLATFORM_API_KEY;
  const key = keyStatus(apiKey);
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;

  if (req.method === "GET") {
    return sendJson(res, 200, {
      ready: key.ok,
      keyType: key.type,
      model,
      endpoint: OPENAI_RESPONSES_URL,
      hint: key.ok
        ? "AI endpoint is configured. Use POST with the twin context."
        : "Add a valid OpenAI Platform API key to OPENAI_API_KEY in Vercel Environment Variables.",
    });
  }

  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Only POST is supported" });
  }

  if (key.type === "missing") {
    return sendJson(res, 503, {
      error: "AI key is not configured",
      answer:
        "ИИ пока работает в offline preview. Добавьте OPENAI_API_KEY в Vercel Environment Variables и сделайте redeploy проекта.",
      diagnostic: { status: 503, keyType: key.type, model },
    });
  }

  if (key.type === "agent-platform-key") {
    return sendJson(res, 401, {
      error: "The configured key has sk-ap prefix and is not accepted by OpenAI Responses API.",
      answer:
        "В Vercel сейчас лежит ключ формата sk-ap-..., а этот endpoint вызывает OpenAI Responses API. Нужен OpenAI Platform API key, обычно формата sk-proj-..., в переменной OPENAI_API_KEY. После замены сделайте redeploy.",
      diagnostic: { status: 401, keyType: key.type, model },
    });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const userInput = [
      `Вопрос пользователя: ${body.question || ""}`,
      "Контекст цифрового двойника:",
      compactContext(body),
    ].join("\n\n");

    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        instructions: SYSTEM_PROMPT,
        input: userInput,
        max_output_tokens: 900,
        reasoning: { effort: "low" },
        text: { verbosity: "medium" },
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const diagnostic = upstreamDiagnostic(response.status, data, model);
      return sendJson(res, response.status, {
        error: diagnostic.message,
        answer: userFacingAiError(diagnostic),
        diagnostic,
      });
    }

    const answer = extractText(data);
    return sendJson(res, 200, {
      answer: answer || "ИИ вернул пустой ответ. Попробуйте уточнить вопрос.",
      model,
      responseId: data.id,
    });
  } catch (error) {
    return sendJson(res, 500, {
      error: error.message,
      answer: "Не удалось обработать запрос к ИИ. Проверьте формат данных и переменные окружения.",
    });
  }
};
