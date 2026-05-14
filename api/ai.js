const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

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
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Only POST is supported" });
  }

  const apiKey = process.env.OPENAI_API_KEY || process.env.AGENT_PLATFORM_API_KEY;
  if (!apiKey) {
    return sendJson(res, 503, {
      error: "AI key is not configured",
      answer:
        "ИИ пока работает в offline preview. Добавьте OPENAI_API_KEY в Vercel Environment Variables и redeploy проекта.",
    });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const model = process.env.OPENAI_MODEL || "gpt-5.4-mini";
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
      return sendJson(res, response.status, {
        error: data.error?.message || "OpenAI request failed",
        answer:
          "ИИ-сервис не ответил. Проверьте ключ, модель и лимиты OpenAI в Vercel Environment Variables.",
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