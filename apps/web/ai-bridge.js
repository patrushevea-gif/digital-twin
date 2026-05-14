(function () {
  const endpoint = "/api/ai";

  function snapshot(question) {
    const currentState = typeof state !== "undefined" ? state : {};
    const history = Array.isArray(currentState.history) ? currentState.history.slice(-12) : [];

    return {
      question,
      factory: typeof factory === "function" ? factory() : null,
      recipe: typeof recipe === "function" ? recipe() : null,
      model: typeof modelSnapshot === "function" ? modelSnapshot() : null,
      actual:
        typeof selectedHistory === "function" && typeof histSnapshot === "function"
          ? histSnapshot(selectedHistory())
          : null,
      scenario: typeof scenarioResult === "function" ? scenarioResult() : null,
      etalon: typeof etalon !== "undefined" ? etalon : null,
      history,
    };
  }

  async function askAgent(question) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snapshot(question)),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data.answer || data.error || "ИИ временно недоступен";
      throw new Error(message);
    }

    return data.answer || "ИИ вернул пустой ответ.";
  }

  function pushMessage(role, text) {
    if (typeof state !== "undefined" && Array.isArray(state.chat)) {
      state.chat.push({ role, text });
      if (typeof save === "function") save();
      if (typeof render === "function") render();
    }
  }

  function replaceLastAssistant(text) {
    if (typeof state !== "undefined" && Array.isArray(state.chat)) {
      for (let i = state.chat.length - 1; i >= 0; i -= 1) {
        if (state.chat[i].role === "assistant") {
          state.chat[i].text = text;
          break;
        }
      }
      if (typeof save === "function") save();
      if (typeof render === "function") render();
    }
  }

  function attachAiHandler() {
    const button = document.getElementById("askAi");
    const input = document.getElementById("aiQuestion");
    if (!button || !input) return;

    button.onclick = async () => {
      const question = input.value.trim();
      if (!question) return;

      input.value = "";
      pushMessage("user", question);
      pushMessage("assistant", "Подключаю AI Agent к текущей модели и истории смен...");

      try {
        const text = await askAgent(question);
        replaceLastAssistant(text);
      } catch (error) {
        const localAnswer = typeof answer === "function" ? answer(question) : "";
        replaceLastAssistant(`${localAnswer}\n\n${error.message}`);
      }
    };

    input.onkeydown = (event) => {
      if (event.key === "Enter") button.click();
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attachAiHandler);
  } else {
    attachAiHandler();
  }

  window.powderTwinAiBridge = { endpoint };
})();