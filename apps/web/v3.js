const $ = (id) => document.getElementById(id);
const fmt = (value) => new Intl.NumberFormat("ru-RU").format(Math.round(value || 0));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const recipes = [
  { id: "polyester-white", name: "Полиэфир белый RAL 9016", nominal: 430, complexity: 1, risk: 0.18, color: "#f4f7fb" },
  { id: "epoxy-black", name: "Эпокси черный RAL 9005", nominal: 385, complexity: 1.14, risk: 0.26, color: "#30343b" },
  { id: "textured-red", name: "Текстурный красный", nominal: 315, complexity: 1.34, risk: 0.38, color: "#c94d47" },
  { id: "primer-grey", name: "Грунт серый промышленный", nominal: 455, complexity: 0.94, risk: 0.15, color: "#9aa6b2" },
];

const equipment = [
  { id: "raw-storage", name: "Склад сырья", short: "Сырье", area: "Подготовка", role: "inventory", cap: 950, cycle: 6, power: 4, crit: 42 },
  { id: "weighing", name: "Дозирование и взвешивание", short: "Дозатор", area: "Подготовка", role: "batching", cap: 520, cycle: 18, power: 7, crit: 68 },
  { id: "premixer", name: "Предварительный смеситель", short: "Смеситель", area: "Смешение", role: "mixing", cap: 500, cycle: 22, power: 18, crit: 61 },
  { id: "extruder", name: "Экструдер", short: "Экструдер", area: "Плавление", role: "extrusion", cap: 410, cycle: 26, power: 96, crit: 94 },
  { id: "cooling-belt", name: "Охлаждающая лента", short: "Охлаждение", area: "Охлаждение", role: "cooling", cap: 450, cycle: 14, power: 22, crit: 72 },
  { id: "crusher", name: "Дробилка", short: "Дробилка", area: "Измельчение", role: "crushing", cap: 430, cycle: 10, power: 31, crit: 74 },
  { id: "mill-classifier", name: "Мельница и классификатор", short: "Мельница", area: "Измельчение", role: "milling", cap: 360, cycle: 32, power: 118, crit: 97 },
  { id: "sieve", name: "Контрольное сито", short: "Сито", area: "Качество", role: "screening", cap: 390, cycle: 16, power: 13, crit: 77 },
  { id: "packing", name: "Фасовка", short: "Фасовка", area: "Готовая продукция", role: "packing", cap: 470, cycle: 20, power: 11, crit: 58 },
  { id: "quality-lab", name: "Лаборатория ОТК", short: "ОТК", area: "Качество", role: "quality", cap: 260, cycle: 28, power: 5, crit: 81 },
];

const factories = [
  { id: "factory-01", name: "Завод 01", description: "Площадка порошковых покрытий", status: "active", area: "Цех покрытий", line: "Линия порошковой краски", equipment: equipment.map((item) => item.id) },
  { id: "factory-02", name: "Завод 02", description: "Вторая производственная площадка", status: "planned", area: "Будущий производственный контур", line: "Линии пока не заведены", equipment: [] },
];

const etalon = { output: 2300, oee: 0.86, downtime: 25, energy: 600, quality: 98, rejectRate: 0.012 };

const state = {
  factory: "factory-01",
  recipe: "polyester-white",
  equipment: "extruder",
  intensity: 72,
  shift: 8,
  batch: 500,
  qualityStrictness: 65,
  cleaning: true,
  lineView: "flow",
  history: JSON.parse(localStorage.getItem("powdertwin.history.v3") || "null") || historySeed,
  selectedHistoryId: localStorage.getItem("powdertwin.history.selected.v3") || "h1",
  scenarios: JSON.parse(localStorage.getItem("powdertwin.scenarios.v3") || "[]"),
  chat: JSON.parse(localStorage.getItem("powdertwin.chat.v3") || "null") || [
    { role: "assistant", text: "Я вижу расчетную модель, историю смен, эталон и сценарии. Спросите, где узкое место или что будет при росте плана." },
  ],
};

function currentRecipe() {
  return recipes.find((item) => item.id === state.recipe) || recipes[0];
}

function currentFactory() {
  return factories.find((item) => item.id === state.factory) || factories[0];
}

function lineEquipment() {
  const factory = currentFactory();
  return factory.equipment.map((id) => equipment.find((item) => item.id === id)).filter(Boolean);
}

function selectedEquipment() {
  return lineEquipment().find((item) => item.id === state.equipment) || lineEquipment()[0];
}

function recipeName(id) {
  return (recipes.find((item) => item.id === id) || recipes[0]).name;
}

function equipmentState(item) {
  const recipe = currentRecipe();
  const demand = recipe.nominal * (state.intensity / 100) * recipe.complexity * clamp(state.batch / 650, 0.75, 1.24);
  const modifier = item.role === "quality" ? 0.65 : item.role === "inventory" ? 0.52 : 1;
  const cleaningBonus = state.cleaning && ["extruder", "mill-classifier", "sieve"].includes(item.id) ? 5 : 0;
  const load = clamp((demand / item.cap) * 100 * modifier - cleaningBonus + item.crit * 0.08, 8, 126);
  const risk = clamp(load * 0.48 + item.crit * 0.32 + recipe.risk * state.qualityStrictness * 0.45 - (state.cleaning ? 8 : 0), 4, 99);
  const status = load > 96 || risk > 84 ? "constraint" : "running";
  return { load, risk, status };
}

function metrics() {
  const rows = lineEquipment().map((item) => ({ item, state: equipmentState(item) }));
  if (!rows.length) return null;
  const path = rows.filter(({ item }) => !["inventory", "quality"].includes(item.role));
  const bottleneck = path.reduce((best, row) => (row.state.load + row.item.crit * 0.18 > best.state.load + best.item.crit * 0.18 ? row : best), path[0]);
  const averageLoad = path.reduce((sum, row) => sum + row.state.load, 0) / path.length;
  const recipe = currentRecipe();
  const availability = clamp(0.94 - (state.cleaning ? 0.035 : 0.085) - Math.max(0, bottleneck.state.risk - 84) / 430, 0.72, 0.98);
  const performance = clamp(1 - Math.max(0, averageLoad - 92) / 185, 0.68, 0.99);
  const quality = clamp(0.985 - recipe.risk * 0.12 - (state.qualityStrictness - 50) / 1100, 0.82, 0.99);
  const oee = availability * performance * quality;
  const throughput = recipe.nominal * (state.intensity / 100) * state.shift * oee * clamp(state.batch / 500, 0.88, 1.12);
  const energy = rows.reduce((sum, row) => sum + row.item.power * (row.state.load / 100) * state.shift, 0);
  return { rows, bottleneck, availability, performance, quality, oee, throughput, energy, averageLoad };
}

function histOee(record) {
  const recipe = recipes.find((item) => item.id === record.recipe) || recipes[0];
  const shift = record.period === "Сутки" ? 24 : 8;
  const availability = clamp(1 - record.downtime / (shift * 60), 0.45, 0.99);
  const performance = clamp(record.output / Math.max(recipe.nominal * shift, 1), 0.45, 1.08);
  const quality = clamp(1 - record.reject / Math.max(record.output, 1), 0.82, 0.999);
  return availability * performance * quality;
}

function selectedHistory() {
  return state.history.find((item) => item.id === state.selectedHistoryId) || state.history[0] || historySeed[0];
}

function modelSnapshot() {
  const model = metrics();
  if (!model) return null;
  return {
    label: "Текущая расчетная модель",
    output: model.throughput,
    oee: model.oee,
    downtime: Math.round((1 - model.availability) * state.shift * 60),
    energy: model.energy,
    quality: Math.round(model.quality * 100),
    bottleneck: model.bottleneck.item.short,
    bottleneckRisk: model.bottleneck.state.risk,
  };
}

function historySnapshot(record = selectedHistory()) {
  return {
    label: `${record.date} · ${record.period}`,
    output: record.output,
    oee: histOee(record),
    downtime: record.downtime,
    energy: record.energy,
    quality: record.quality,
    reject: record.reject,
    bottleneck: record.bottleneck,
  };
}

function averageHistory() {
  const list = state.history.length ? state.history : historySeed;
  const avg = (key) => list.reduce((sum, item) => sum + Number(item[key] || 0), 0) / list.length;
  return {
    label: "Средний режим истории",
    output: avg("output"),
    oee: list.reduce((sum, item) => sum + histOee(item), 0) / list.length,
    downtime: avg("downtime"),
    energy: avg("energy"),
    quality: avg("quality"),
    bottleneck: "по статистике",
  };
}

function scenarioResult() {
  const baseMode = $("scenarioBase").value;
  const base = baseMode === "history" ? historySnapshot() : baseMode === "average" ? averageHistory() : modelSnapshot();
  const recipe = currentRecipe();
  const plan = Number($("scenarioPlan").value || 100);
  const downtime = Number($("scenarioDowntime").value || 0);
  const colors = Number($("scenarioColors").value || 1);
  const totalDowntime = (base?.downtime || 0) + downtime + colors * 18;
  const availableHours = Math.max(0.6, state.shift - totalDowntime / 60);
  const quality = clamp((base?.quality || 96) / 100 - recipe.risk * 0.08 - colors * 0.006, 0.76, 0.99);
  const output = recipe.nominal * availableHours * (plan / 100) * clamp(state.batch / 500, 0.86, 1.14) * quality;
  const oee = clamp((availableHours / state.shift) * (plan / 100) * quality, 0.35, 0.98);
  const energy = (base?.energy || etalon.energy) * clamp(output / Math.max(base?.output || etalon.output, 1), 0.45, 1.6);
  const bottleneck = downtime > 45 ? "Мельница / простой" : colors > 2 ? "Сито / очистка" : recipe.complexity > 1.2 ? "Мельница + ОТК" : "Экструдер";
  return { base, plan, downtime, colors, totalDowntime, quality, output, oee, energy, bottleneck };
}

function saveState() {
  localStorage.setItem("powdertwin.history.v3", JSON.stringify(state.history));
  localStorage.setItem("powdertwin.history.selected.v3", state.selectedHistoryId);
  localStorage.setItem("powdertwin.scenarios.v3", JSON.stringify(state.scenarios.slice(0, 8)));
  localStorage.setItem("powdertwin.chat.v3", JSON.stringify(state.chat.slice(-10)));
}

function renderFactories() {
  $("factoryList").innerHTML = factories.map((factory) => `
    <button class="factory-card ${factory.id === state.factory ? "active" : ""}" data-factory="${factory.id}" type="button">
      <strong>${factory.name}</strong>
      <small>${factory.description}</small>
      <small>${factory.status === "active" ? "1 линия · offline twin" : "контур создан · данных нет"}</small>
    </button>
  `).join("");
  document.querySelectorAll("[data-factory]").forEach((button) => {
    button.onclick = () => {
      state.factory = button.dataset.factory;
      state.equipment = lineEquipment()[0]?.id || "";
      render();
    };
  });
}

function renderKpi(model) {
  const cards = model ? [
    ["Выпуск", `${fmt(model.throughput)} кг`, `${state.shift} ч · ${currentRecipe().name}`],
    ["OEE", `${Math.round(model.oee * 100)}%`, `${Math.round(model.availability * 100)} / ${Math.round(model.performance * 100)} / ${Math.round(model.quality * 100)}`],
    ["Узкое место", model.bottleneck.item.short, `${Math.round(model.bottleneck.state.load)}% загрузка`],
    ["Риск качества", `${Math.round((1 - model.quality) * 100)}%`, `${currentRecipe().name}`],
    ["Энергия", `${fmt(model.energy)} кВт·ч`, `${(model.energy / Math.max(model.throughput, 1)).toFixed(2)} кВт·ч/кг`],
  ] : [
    ["Завод 02", "контур", "ожидает данных"],
    ["Линии", "0", "оборудование не заведено"],
    ["OEE", "-", "нет модели"],
    ["Риск качества", "-", "нет расчетов"],
    ["Энергия", "-", "нет данных"],
  ];

  $("kpiRow").innerHTML = cards.map((card) => `
    <article class="kpi-card">
      <span>${card[0]}</span>
      <strong>${card[1]}</strong>
      <small>${card[2]}</small>
    </article>
  `).join("");
}

function renderLine(model) {
  const rows = model?.rows || [];
  const isScheme = state.lineView === "scheme";
  $("line").classList.toggle("scheme-mode", isScheme);
  $("lineFlow").hidden = isScheme;
  $("lineMap").hidden = !isScheme;
  $("controlDeck").hidden = isScheme;
  $("flowViewButton").classList.toggle("active", !isScheme);
  $("schemeViewButton").classList.toggle("active", isScheme);
  $("lineStatus").textContent = isScheme ? "схема связей" : (currentFactory().status === "active" ? "расчетная модель" : "планируется");

  $("lineFlow").innerHTML = lineEquipment().map((item, index) => {
    const row = rows.find((entry) => entry.item.id === item.id) || { state: equipmentState(item) };
    const isActive = item.id === state.equipment;
    const isConstraint = model?.bottleneck?.item.id === item.id || row.state.status === "constraint";
    return `
      <button class="equipment-node ${isActive ? "active" : ""} ${isConstraint ? "constraint" : ""}" data-equipment="${item.id}" type="button">
        <div class="node-top"><i class="node-dot"></i><span class="node-load">${Math.round(row.state.load)}%</span></div>
        <strong>${index + 1}. ${item.short}</strong>
        <small>${item.area}</small>
        <div class="node-bar" style="--value:${clamp(row.state.load, 0, 100)}%"><i></i></div>
      </button>
    `;
  }).join("") || `<div class="equipment-node"><strong>Контур завода готов</strong><small>Оборудование добавим после данных</small></div>`;

  document.querySelectorAll("[data-equipment]").forEach((button) => {
    button.onclick = () => {
      state.equipment = button.dataset.equipment;
      render();
    };
  });

  renderLineMap(model);
}

function renderLineMap(model) {
  const route = lineEquipment().filter((item) => item.id !== "quality-lab");
  const quality = lineEquipment().find((item) => item.id === "quality-lab");
  const rows = model?.rows || [];
  const node = (item, index, extraClass = "") => {
    const row = rows.find((entry) => entry.item.id === item.id) || { state: equipmentState(item) };
    const active = item.id === state.equipment ? "active" : "";
    const constraint = model?.bottleneck?.item.id === item.id || row.state.status === "constraint" ? "constraint" : "";
    return `
      <button class="scheme-node ${active} ${constraint} ${extraClass}" data-equipment="${item.id}" type="button">
        <span class="scheme-index">${index + 1}</span>
        <strong>${item.short}</strong>
        <small>${item.area}</small>
        <small>${Math.round(row.state.load)}% загрузка · ${item.cap} кг/ч</small>
      </button>
    `;
  };
  const routeNodes = route.slice(0, 5).map((item, index) => node(item, index)).join("");
  const routeNodes2 = route.slice(5).map((item, index) => node(item, index + 5)).join("");
  const qualityNode = quality ? node(quality, route.length, "quality-node") : "";

  $("lineMap").innerHTML = route.length ? `
    <div class="scheme-row">${routeNodes}</div>
    <div class="scheme-row">${routeNodes2}</div>
    <div class="scheme-branch">
      <div class="branch-line" aria-hidden="true"></div>
      ${qualityNode}
    </div>
  ` : `<div class="scheme-node"><strong>Контур завода готов</strong><small>Связи оборудования добавим после данных.</small></div>`;

  document.querySelectorAll("#lineMap [data-equipment]").forEach((button) => {
    button.onclick = () => {
      state.equipment = button.dataset.equipment;
      render();
    };
  });
}

function renderEquipment(model) {
  const item = selectedEquipment();
  if (!item) {
    $("equipmentName").textContent = "Оборудование не задано";
    $("equipmentMeta").innerHTML = "";
    $("gaugeList").innerHTML = "";
    return;
  }

  const row = model?.rows.find((entry) => entry.item.id === item.id);
  const itemState = row?.state || equipmentState(item);
  $("equipmentArea").textContent = item.area;
  $("equipmentName").textContent = item.name;
  $("equipmentStatus").textContent = itemState.status === "constraint" ? "LIMIT" : "RUN";

  $("equipmentMeta").innerHTML = [
    ["Мощность", `${item.cap} кг/ч`],
    ["Цикл", item.cycle ? `${item.cycle} мин` : "online"],
    ["Критичность", `${item.crit}/100`],
    ["Энергия", `${item.power} кВт`],
  ].map((entry) => `<article><small>${entry[0]}</small><strong>${entry[1]}</strong></article>`).join("");

  $("gaugeList").innerHTML = [
    ["Загрузка", itemState.load, ""],
    ["Риск", itemState.risk, "risk"],
  ].map((entry) => `
    <div class="gauge-row">
      <div class="gauge-head"><span>${entry[0]}</span><strong>${Math.round(entry[1])}%</strong></div>
      <div class="gauge-track ${entry[2]}" style="--value:${clamp(entry[1], 0, 100)}%"><span></span></div>
    </div>
  `).join("");
}

function focusItems(model) {
  if (!model) return ["Для второго завода пока создан только контур."];
  const actual = historySnapshot();
  const items = [
    `Главный фокус: ${model.bottleneck.item.name}. Загрузка ${Math.round(model.bottleneck.state.load)}%, риск ${Math.round(model.bottleneck.state.risk)}%.`,
    `Факт выбранной смены: ${fmt(actual.output)} кг, ${actual.downtime} мин простоя, качество ${actual.quality}%.`,
    `Энергия: ${(model.energy / Math.max(model.throughput, 1)).toFixed(2)} кВт·ч/кг. Сравнивать с эталоном ${(etalon.energy / etalon.output).toFixed(2)}.`,
  ];
  if (!state.cleaning) items.unshift("Очистка отключена: растет риск качества при сменах цвета и сложных рецептурах.");
  return items;
}

function renderFocus(model) {
  $("focusList").innerHTML = focusItems(model).map((item, index) => `
    <article class="focus-item">
      <strong>${index + 1}. ${item.split(".")[0]}.</strong>
      <small>${item.split(".").slice(1).join(".").trim()}</small>
    </article>
  `).join("");
}

function renderAi(model) {
  const actual = historySnapshot();
  const brief = model
    ? `Сейчас ограничивает ${model.bottleneck.item.short}. Риск качества ${Math.round((1 - model.quality) * 100)}%, лучший быстрый шаг: проверить скорость узла и эффект очистки.`
    : "Для выбранного завода пока нет активной линии. Добавьте оборудование и маршрут.";
  const cards = [
    ["AI Brief", brief],
    ["Боттлнек", model ? `${model.bottleneck.item.short}: ${Math.round(model.bottleneck.state.risk)}% риска` : "нет активной линии"],
    ["Калибровка", `Факт vs модель: ${model ? fmt(actual.output - model.throughput) : 0} кг`],
  ];
  $("aiSummary").innerHTML = cards.map((card) => `<article><strong>${card[0]}</strong><small>${card[1]}</small></article>`).join("");
  const prompts = [
    "Что ограничивает выпуск?",
    "Какой сценарий лучше?",
    "Какие данные нужны?",
    "Что даст очистка?",
    "Почему OEE ниже эталона?"
  ];
  $("aiPrompts").innerHTML = prompts.map((prompt) => `<button type="button" data-ai-prompt="${prompt}">${prompt}</button>`).join("");
  document.querySelectorAll("[data-ai-prompt]").forEach((button) => {
    button.onclick = () => submitAiQuestion(button.dataset.aiPrompt);
  });
  $("chatLog").innerHTML = state.chat.slice(-8).map((message) => `
    <div class="chat-message ${message.role === "user" ? "user" : ""}">
      <small>${message.role === "user" ? "Вы" : "AI Copilot"}</small>
      <div>${message.text}</div>
    </div>
  `).join("");
  $("chatLog").scrollTop = $("chatLog").scrollHeight;
}

function renderScenario() {
  const result = scenarioResult();
  $("scenarioResult").innerHTML = [
    ["База", result.base?.label || "модель"],
    ["Выпуск", `${fmt(result.output)} кг`],
    ["OEE", `${Math.round(result.oee * 100)}%`],
    ["Узкое место", result.bottleneck],
  ].map((entry) => `<article><small>${entry[0]}</small><strong>${entry[1]}</strong></article>`).join("");

  const qualityRisk = Math.round((1 - result.quality) * 100);
  const delta = result.base ? result.output - result.base.output : 0;
  $("decisionPassport").innerHTML = `
    <span class="eyebrow">AI Passport of Decision</span>
    <h3>Паспорт решения</h3>
    <div class="decision-grid">
      <article><small>Проблема</small><strong>${result.bottleneck}</strong></article>
      <article><small>Причина</small><strong>${result.colors > 2 ? "частая смена цвета" : result.downtime > 45 ? "дополнительный простой" : "ограничение мощности"}</strong></article>
      <article><small>Эффект</small><strong>${delta >= 0 ? "+" : ""}${fmt(delta)} кг к базе</strong></article>
      <article><small>Риск</small><strong>${qualityRisk}% по качеству</strong></article>
    </div>
    <p>Проверить на заводе: фактическую скорость узкого места, длительность очистки, потери при смене цвета и отклонения по гранулометрии.</p>
  `;
}

function renderHistory() {
  $("historyCount").textContent = `${state.history.length} записей`;
  $("historyList").innerHTML = [...state.history].sort((a, b) => b.date.localeCompare(a.date)).map((record) => `
    <button class="history-row ${record.id === state.selectedHistoryId ? "active" : ""}" data-history="${record.id}" type="button">
      <span><strong>${record.date} · ${record.period}</strong><small>${recipeName(record.recipe)}</small><small>${record.note} · ${record.bottleneck}</small></span>
      <span><strong>${fmt(record.output)} кг</strong><small>${Math.round(histOee(record) * 100)}% OEE · ${record.downtime} мин</small></span>
    </button>
  `).join("");

  document.querySelectorAll("[data-history]").forEach((button) => {
    button.onclick = () => {
      state.selectedHistoryId = button.dataset.history;
      saveState();
      render();
    };
  });
}

function renderReadiness() {
  const items = [
    ["Планировка линии", 18, "Нужно фактическое расположение узлов и буферов."],
    ["Паспорта оборудования", 25, "Нужны мощности, ограничения, год, модель, производитель."],
    ["История смен", 36, "Пока демо-данные и ручной ввод."],
    ["Простои", 22, "Нужны причины, длительность, повторяемость."],
    ["Качество", 28, "Нужны d50/d90, oversize, цвет, gel time."],
    ["Энергия", 20, "Нужны кВт·ч по линии или ключевым узлам."],
  ];

  $("readinessList").innerHTML = items.map((item) => `
    <article>
      <strong>${item[0]} · ${item[1]}%</strong>
      <div class="mini-bar" style="--value:${item[1]}%"><i></i></div>
      <small>${item[2]}</small>
    </article>
  `).join("");
}

function renderHelp() {
  const items = [
    ["Цель", "Собрать Line Twin MVP: оборудование, рецептура, смена, расчет выпуска, bottleneck и рекомендация."],
    ["Старт", "Первый экран сразу показывает KPI, схему линии, быстрые параметры смены и AI Brief."],
    ["Схема линии", "Переключатель Пульт линии / Схема связей показывает либо расчетную панель, либо маршрут оборудования."],
    ["Паспорт решения", "После сценария система формирует проблему, причину, эффект, риск и что проверить на заводе."],
    ["AI", "AI Copilot получает текущий контекст двойника и отвечает через серверный endpoint /api/ai. Серверный bridge может работать через AgentPlatform или напрямую через OpenAI, ключ хранится в Vercel."],
    ["Карта проекта", "Ниже стартового экрана показаны 5 уровней: Platform, Factory Twin, Line Twin, Process Twin и AI Layer."],
    ["Данные", "Пока значения расчетные. Для точности нужны паспорта оборудования, времена операций, простои, качество и энергия."],
  ];
  $("helpContent").innerHTML = items.map((item) => `<article><h3>${item[0]}</h3><p>${item[1]}</p></article>`).join("");
}

function render() {
  const factory = currentFactory();
  const model = metrics();
  $("breadcrumb").textContent = `${factory.name} / ${factory.area} / ${factory.line}`;
  $("lineStatus").textContent = factory.status === "active" ? "расчетная модель" : "планируется";
  renderFactories();
  renderKpi(model);
  renderLine(model);
  renderEquipment(model);
  renderFocus(model);
  renderAi(model);
  renderScenario();
  renderHistory();
  renderReadiness();
}

function localAnswer(question) {
  const text = question.toLowerCase();
  const model = modelSnapshot();
  const actual = historySnapshot();
  const scenario = scenarioResult();
  if (text.includes("узк") || text.includes("бутыл")) return `Сейчас расчетное узкое место: ${model?.bottleneck || "нет данных"}. По выбранной смене ограничение: ${actual.bottleneck}. Проверьте фактическую скорость, простои и буфер перед этим узлом.`;
  if (text.includes("качеств") || text.includes("брак")) return `Качество выбранной смены ${actual.quality}%, брак ${fmt(actual.reject)} кг. Для точного вывода нужны d50/d90, oversize, цвет/DeltaE и gel time.`;
  if (text.includes("энерг")) return `Расчетная энергия ${fmt(model?.energy)} кВт·ч, примерно ${((model?.energy || 0) / Math.max(model?.output || 1, 1)).toFixed(2)} кВт·ч/кг. Сравнивайте с эталоном ${(etalon.energy / etalon.output).toFixed(2)}.`;
  if (text.includes("сцен") || text.includes("если")) return `Scenario Lab сейчас дает ${fmt(scenario.output)} кг, ${Math.round(scenario.oee * 100)}% OEE. Ограничение сценария: ${scenario.bottleneck}.`;
  return `Сейчас модель считает выпуск ${fmt(model?.output)} кг, OEE ${Math.round((model?.oee || 0) * 100)}%, узкое место ${model?.bottleneck || "нет данных"}.`;
}

async function askAi(question) {
  const payload = {
    question,
    factory: currentFactory(),
    recipe: currentRecipe(),
    model: modelSnapshot(),
    actual: historySnapshot(),
    scenario: scenarioResult(),
    etalon,
    history: state.history.slice(0, 12),
  };

  const response = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.answer || data.error || "AI endpoint unavailable");
  return data.answer || "ИИ вернул пустой ответ.";
}

async function submitAiQuestion(question) {
  const cleanQuestion = (question || $("aiQuestion").value).trim();
  if (!cleanQuestion) return;
  $("aiQuestion").value = "";
  state.chat.push({ role: "user", text: cleanQuestion }, { role: "assistant", text: "Подключаю AI Agent к текущему состоянию линии..." });
  saveState();
  render();
  try {
    state.chat[state.chat.length - 1].text = await askAi(cleanQuestion);
  } catch (error) {
    state.chat[state.chat.length - 1].text = `${localAnswer(cleanQuestion)}\n\n${error.message}`;
  }
  saveState();
  render();
}

function initControls() {
  $("recipeSelect").innerHTML = recipes.map((recipe) => `<option value="${recipe.id}">${recipe.name}</option>`).join("");
  $("histRecipe").innerHTML = $("recipeSelect").innerHTML;
  $("recipeSelect").value = state.recipe;
  $("histRecipe").value = state.recipe;
  $("histDate").value = new Date().toISOString().slice(0, 10);
  $("scenarioBase").innerHTML = `<option value="model">Текущая модель</option><option value="history">Выбранная смена</option><option value="average">Средний период</option>`;
  $("flowViewButton").onclick = () => {
    state.lineView = "flow";
    render();
  };
  $("schemeViewButton").onclick = () => {
    state.lineView = "scheme";
    render();
  };

  ["intensity", "shift", "batch", "qualityStrictness"].forEach((id) => {
    $(id).value = state[id];
    $(id).oninput = (event) => {
      state[id] = Number(event.target.value);
      render();
    };
  });
  $("cleaning").checked = state.cleaning;
  $("cleaning").onchange = (event) => {
    state.cleaning = event.target.checked;
    render();
  };
  $("recipeSelect").onchange = (event) => {
    state.recipe = event.target.value;
    $("histRecipe").value = state.recipe;
    render();
  };
  ["scenarioBase", "scenarioPlan", "scenarioDowntime", "scenarioColors"].forEach((id) => {
    $(id).oninput = render;
  });

  $("resetButton").onclick = () => {
    Object.assign(state, { factory: "factory-01", recipe: "polyester-white", equipment: "extruder", intensity: 72, shift: 8, batch: 500, qualityStrictness: 65, cleaning: true });
    initControls();
    render();
  };
  $("saveScenario").onclick = () => {
    const model = modelSnapshot();
    if (!model) return;
    state.scenarios.unshift({ time: new Date().toLocaleString("ru-RU"), output: model.output, oee: model.oee, recipe: currentRecipe().name });
    saveState();
    render();
  };
  $("addHistory").onclick = () => {
    const record = {
      id: `manual-${Date.now()}`,
      date: $("histDate").value || new Date().toISOString().slice(0, 10),
      period: $("histPeriod").value,
      recipe: $("histRecipe").value,
      batch: Number($("histBatch").value || 0),
      output: Number($("histOutput").value || 0),
      reject: Number($("histReject").value || 0),
      downtime: Number($("histDowntime").value || 0),
      energy: Number($("histEnergy").value || 0),
      quality: Number($("histQuality").value || 0),
      bottleneck: selectedEquipment()?.short || "не задано",
      note: "ручной ввод",
    };
    state.history.unshift(record);
    state.selectedHistoryId = record.id;
    saveState();
    render();
  };
  $("csvTemplate").onclick = () => {
    const csv = "date,period,recipe,batch_kg,output_kg,reject_kg,downtime_min,energy_kwh,quality_pct,bottleneck\n2026-05-14,Смена A,polyester-white,500,2100,25,30,620,97,Экструдер";
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = "powdertwin-history-template.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 500);
  };
  $("askAi").onclick = async () => {
    await submitAiQuestion();
  };
  $("aiQuestion").onkeydown = (event) => {
    if (event.key === "Enter") $("askAi").click();
  };
}

function initAuth() {
  const key = "powdertwin.access.v3";
  const overlay = $("authOverlay");
  const unlock = () => {
    document.body.classList.remove("auth-locked");
    overlay.hidden = true;
  };
  if (localStorage.getItem(key) === "ok" || sessionStorage.getItem(key) === "ok") {
    unlock();
  } else {
    document.body.classList.add("auth-locked");
    overlay.hidden = false;
    setTimeout(() => $("authCode").focus(), 80);
  }
  $("authForm").onsubmit = (event) => {
    event.preventDefault();
    if ($("authCode").value.trim() === "twin2026") {
      ($("authRemember").checked ? localStorage : sessionStorage).setItem(key, "ok");
      unlock();
    } else {
      $("authError").textContent = "Неверный код доступа";
      $("authCode").select();
    }
  };
  $("logoutButton").onclick = () => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
    location.reload();
  };
}

function initHelp() {
  renderHelp();
  const open = () => {
    $("helpOverlay").hidden = false;
  };
  const close = () => {
    $("helpOverlay").hidden = true;
  };
  $("helpButton").onclick = open;
  $("helpClose").onclick = close;
  $("helpOverlay").onclick = (event) => {
    if (event.target === $("helpOverlay")) close();
  };
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
}

initControls();
initAuth();
initHelp();
render();
