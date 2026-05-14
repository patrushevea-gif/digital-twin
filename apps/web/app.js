"use strict";

const model = JSON.parse(document.getElementById("plant-model").textContent);
const recipes = model.recipes;
const equipment = model.equipment;
const scenarioKey = "powdertwin.scenarios.v2";

const state = {
  selectedFactoryId: "factory-01",
  selectedEquipmentId: "extruder",
  selectedRecipeId: recipes[0].id,
  compareScenarioId: null,
  intensity: 72,
  shiftHours: 8,
  batchKg: 500,
  qualityStrictness: 65,
  cleaningEnabled: true,
  paused: false,
  tab: "ops",
  time: 0,
  scenarios: loadScenarios(),
};

const canvas = document.getElementById("line-canvas");
const ctx = canvas.getContext("2d");

const refs = {
  factoryStrip: document.getElementById("factory-strip"),
  breadcrumb: document.getElementById("breadcrumb"),
  recipeSelect: document.getElementById("recipe-select"),
  pauseButton: document.getElementById("pause-button"),
  resetButton: document.getElementById("reset-button"),
  intensityRange: document.getElementById("intensity-range"),
  shiftRange: document.getElementById("shift-range"),
  batchRange: document.getElementById("batch-range"),
  qualityRange: document.getElementById("quality-range"),
  cleaningToggle: document.getElementById("cleaning-toggle"),
  saveScenario: document.getElementById("save-scenario"),
  clearScenarios: document.getElementById("clear-scenarios"),
  factoryContext: document.getElementById("factory-context"),
  lineTitle: document.getElementById("line-title"),
  lineMode: document.getElementById("line-mode"),
  structureMap: document.getElementById("structure-map"),
  structureStatus: document.getElementById("structure-status"),
  assetList: document.getElementById("asset-list"),
  scenarioList: document.getElementById("scenario-list"),
  comparePanel: document.getElementById("compare-panel"),
  canvasLineName: document.getElementById("canvas-line-name"),
};

const mainPath = ["raw-storage", "weighing", "premixer", "extruder", "cooling-belt", "crusher", "mill-classifier", "sieve", "packing"];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const formatNumber = (value) => new Intl.NumberFormat("ru-RU").format(Math.round(value));
const getRecipe = () => recipes.find((recipe) => recipe.id === state.selectedRecipeId) || recipes[0];
const getFactory = () => model.factories.find((factory) => factory.id === state.selectedFactoryId) || model.factories[0];
const getArea = () => getFactory().areas[0] || null;
const getLine = () => getArea()?.lines[0] || null;
const getLineEquipment = () => {
  const line = getLine();
  if (!line) return [];
  return line.equipmentIds.map((id) => equipment.find((item) => item.id === id)).filter(Boolean);
};
const getSelectedEquipment = () => getLineEquipment().find((item) => item.id === state.selectedEquipmentId) || getLineEquipment()[0] || null;

function loadScenarios() {
  try {
    return JSON.parse(localStorage.getItem(scenarioKey) || "[]");
  } catch {
    return [];
  }
}

function persistScenarios() {
  localStorage.setItem(scenarioKey, JSON.stringify(state.scenarios.slice(0, 8)));
}

function init() {
  recipes.forEach((recipe) => {
    const option = document.createElement("option");
    option.value = recipe.id;
    option.textContent = recipe.name;
    refs.recipeSelect.appendChild(option);
  });

  syncControls();
  wireEvents();
  resizeCanvas();
  render();
  requestAnimationFrame(tick);
}

function wireEvents() {
  refs.recipeSelect.addEventListener("change", (event) => {
    state.selectedRecipeId = event.target.value;
    render();
  });

  refs.intensityRange.addEventListener("input", (event) => {
    state.intensity = Number(event.target.value);
    render();
  });

  refs.shiftRange.addEventListener("input", (event) => {
    state.shiftHours = Number(event.target.value);
    render();
  });

  refs.batchRange.addEventListener("input", (event) => {
    state.batchKg = Number(event.target.value);
    render();
  });

  refs.qualityRange.addEventListener("input", (event) => {
    state.qualityStrictness = Number(event.target.value);
    render();
  });

  refs.cleaningToggle.addEventListener("change", (event) => {
    state.cleaningEnabled = event.target.checked;
    render();
  });

  refs.pauseButton.addEventListener("click", () => {
    state.paused = !state.paused;
    refs.pauseButton.textContent = state.paused ? "▶" : "II";
  });

  refs.resetButton.addEventListener("click", () => {
    Object.assign(state, {
      selectedFactoryId: "factory-01",
      selectedEquipmentId: "extruder",
      selectedRecipeId: recipes[0].id,
      intensity: 72,
      shiftHours: 8,
      batchKg: 500,
      qualityStrictness: 65,
      cleaningEnabled: true,
      compareScenarioId: null,
    });
    syncControls();
    render();
  });

  refs.saveScenario.addEventListener("click", saveCurrentScenario);
  refs.clearScenarios.addEventListener("click", () => {
    state.scenarios = [];
    state.compareScenarioId = null;
    persistScenarios();
    renderScenarioPanel();
  });

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      state.tab = tab.dataset.tab;
      document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("active", item.dataset.tab === state.tab));
      renderInsightPanel();
    });
  });

  canvas.addEventListener("click", (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const hit = getLineEquipment().find((item) => {
      const point = layoutPoint(item, rect.width, rect.height);
      return Math.hypot(point.x - x, point.y - y) < 36;
    });

    if (hit) {
      state.selectedEquipmentId = hit.id;
      render();
    }
  });

  window.addEventListener("resize", resizeCanvas);
}

function syncControls() {
  refs.recipeSelect.value = state.selectedRecipeId;
  refs.intensityRange.value = String(state.intensity);
  refs.shiftRange.value = String(state.shiftHours);
  refs.batchRange.value = String(state.batchKg);
  refs.qualityRange.value = String(state.qualityStrictness);
  refs.cleaningToggle.checked = state.cleaningEnabled;
}

function saveCurrentScenario() {
  const metrics = computeMetrics();
  if (!metrics) return;

  const scenario = {
    id: `scenario-${Date.now()}`,
    name: `${getFactory().shortName}: ${getRecipe().name}`,
    createdAt: new Date().toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
    state: {
      selectedFactoryId: state.selectedFactoryId,
      selectedRecipeId: state.selectedRecipeId,
      intensity: state.intensity,
      shiftHours: state.shiftHours,
      batchKg: state.batchKg,
      qualityStrictness: state.qualityStrictness,
      cleaningEnabled: state.cleaningEnabled,
    },
    metrics: pickScenarioMetrics(metrics),
  };

  state.scenarios = [scenario, ...state.scenarios].slice(0, 8);
  state.compareScenarioId = scenario.id;
  persistScenarios();
  renderScenarioPanel();
}

function pickScenarioMetrics(metrics) {
  return {
    throughput: metrics.throughput,
    oee: metrics.oee,
    energy: metrics.energy,
    quality: metrics.quality,
    bottleneck: metrics.bottleneck?.item.shortName || "-",
  };
}

function computeEquipmentState(item) {
  const recipe = getRecipe();
  const batchPressure = clamp(state.batchKg / 650, 0.75, 1.24);
  const baseDemand = recipe.nominalKgH * (state.intensity / 100) * recipe.complexity * batchPressure;
  const roleModifier = item.role === "utility" ? 0.72 : item.role === "quality" ? 0.6 : 1;
  const timeWave = Math.sin(state.time * 0.0017 + item.x * 8 + item.y * 4) * 6;
  const cleaningPenalty = state.cleaningEnabled && ["sieve", "mill-classifier", "extruder"].includes(item.id) ? 5 : 0;
  const load = clamp((baseDemand / Math.max(item.capacityKgH, 1)) * 100 * roleModifier + timeWave - cleaningPenalty, 8, 126);
  const risk = clamp(load * 0.46 + item.criticality * 0.34 + recipe.qualityRisk * state.qualityStrictness * 0.48 - (state.cleaningEnabled ? 8 : 0), 4, 99);
  const status = state.paused ? "idle" : load > 96 || risk > 88 ? "constraint" : "running";
  return { load, risk, status };
}

function computeMetrics() {
  const lineEquipment = getLineEquipment();
  if (!lineEquipment.length) return null;

  const computed = lineEquipment.map((item) => ({ item, state: computeEquipmentState(item) }));
  const pathEquipment = computed.filter(({ item }) => mainPath.includes(item.id));
  const bottleneck = pathEquipment.reduce((max, current) => {
    const score = current.state.load + current.item.criticality * 0.22;
    const maxScore = max.state.load + max.item.criticality * 0.22;
    return score > maxScore ? current : max;
  }, pathEquipment[0]);

  const avgLoad = pathEquipment.reduce((sum, item) => sum + item.state.load, 0) / pathEquipment.length;
  const recipe = getRecipe();
  const plannedCleaningLoss = state.cleaningEnabled ? 0.035 : 0.085;
  const availability = clamp(0.94 - plannedCleaningLoss - Math.max(0, bottleneck.state.risk - 84) / 400, 0.72, 0.98);
  const performance = clamp(1 - Math.max(0, avgLoad - 92) / 180, 0.68, 0.99);
  const quality = clamp(0.985 - recipe.qualityRisk * 0.12 - (state.qualityStrictness - 50) / 1100, 0.82, 0.99);
  const oee = availability * performance * quality;
  const throughput = recipe.nominalKgH * (state.intensity / 100) * state.shiftHours * oee * clamp(state.batchKg / 500, 0.88, 1.12);
  const energy = computed.reduce((sum, row) => sum + row.item.powerKw * (row.state.load / 100) * state.shiftHours, 0);
  const qualityRisk = clamp((1 - quality) * 100 + recipe.qualityRisk * 28 + (state.qualityStrictness - 50) * 0.16, 3, 40);

  return { computed, bottleneck, avgLoad, availability, performance, quality, oee, throughput, energy, qualityRisk };
}

function render() {
  const factory = getFactory();
  const area = getArea();
  const line = getLine();

  refs.breadcrumb.textContent = line ? `${factory.name} / ${area.name} / ${line.name}` : `${factory.name} / структура готовится`;
  refs.factoryContext.textContent = line ? `${factory.name} · ${area.name}` : `${factory.name} · будущий контур`;
  refs.lineTitle.textContent = line?.name || "Линии пока не заведены";
  refs.lineMode.textContent = line?.mode || "planned";
  refs.canvasLineName.textContent = line?.name || "Factory layer";
  refs.structureStatus.textContent = factory.status === "active" ? "активная" : "план";

  renderFactoryStrip();
  renderStructure();
  renderAssetList();
  renderMetrics();
  renderEquipmentPanel();
  renderInsightPanel();
  renderScenarioPanel();
  renderCanvas();
}

function renderFactoryStrip() {
  refs.factoryStrip.textContent = "";

  model.factories.forEach((factory) => {
    const active = factory.id === state.selectedFactoryId;
    const lineCount = factory.areas.reduce((sum, area) => sum + area.lines.length, 0);
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = `factory-tile ${active ? "active" : ""}`;
    tile.innerHTML = `
      <div>
        <p class="panel-kicker">${factory.name}</p>
        <h2>${factory.description}</h2>
        <span>${lineCount || "нет"} линий · ${factory.status === "active" ? "offline twin" : "структура готовится"}</span>
      </div>
      <strong class="factory-badge">${factory.status === "active" ? "LIVE" : "SOON"}</strong>
    `;
    tile.addEventListener("click", () => {
      state.selectedFactoryId = factory.id;
      const nextEquipment = getLineEquipment()[0];
      state.selectedEquipmentId = nextEquipment?.id || "";
      state.compareScenarioId = null;
      render();
    });
    refs.factoryStrip.appendChild(tile);
  });
}

function renderStructure() {
  const factory = getFactory();
  const area = getArea();
  const line = getLine();
  const nodes = [
    { label: model.company.name, meta: "Company" },
    { label: factory.name, meta: factory.status === "active" ? "Factory active" : "Factory planned" },
    { label: area?.name || "Зона не создана", meta: "Area" },
    { label: line?.name || "Линия не создана", meta: line ? "Line" : "Planned" },
  ];

  refs.structureMap.innerHTML = nodes.map((node) => `
    <div class="structure-node">
      <i></i>
      <strong>${node.label}</strong>
      <span>${node.meta}</span>
    </div>
  `).join("");
}

function renderAssetList() {
  const lineEquipment = getLineEquipment();
  refs.assetList.textContent = "";

  if (!lineEquipment.length) {
    refs.assetList.innerHTML = `<div class="empty-state">Для второго завода пока создан только контур. Оборудование добавим, когда появится состав линии.</div>`;
    return;
  }

  lineEquipment.forEach((item) => {
    const computed = computeEquipmentState(item);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `asset-button ${item.id === state.selectedEquipmentId ? "active" : ""}`;
    button.innerHTML = `
      <span class="status-light status-${computed.status}"></span>
      <span>
        <strong>${item.shortName}</strong>
        <span class="asset-caption">${item.area}</span>
      </span>
      <span class="asset-caption">${Math.round(computed.load)}%</span>
    `;
    button.addEventListener("click", () => {
      state.selectedEquipmentId = item.id;
      render();
    });
    refs.assetList.appendChild(button);
  });
}

function renderMetrics() {
  const metrics = computeMetrics();

  if (!metrics) {
    setText("metric-throughput", "0 кг");
    setText("metric-throughput-caption", "нет линии");
    setText("metric-oee", "0%");
    setText("metric-oee-caption", "нет модели");
    setText("metric-bottleneck", "-");
    setText("metric-bottleneck-caption", "нет оборудования");
    setText("metric-energy", "0 кВт·ч");
    setText("metric-energy-caption", "нет данных");
    return;
  }

  setText("metric-throughput", `${formatNumber(metrics.throughput)} кг`);
  setText("metric-throughput-caption", `${state.shiftHours} ч · ${getRecipe().name}`);
  setText("metric-oee", `${Math.round(metrics.oee * 100)}%`);
  setText("metric-oee-caption", `${Math.round(metrics.availability * 100)} / ${Math.round(metrics.performance * 100)} / ${Math.round(metrics.quality * 100)}`);
  setText("metric-bottleneck", metrics.bottleneck.item.shortName);
  setText("metric-bottleneck-caption", `${Math.round(metrics.bottleneck.state.load)}% загрузка · риск ${Math.round(metrics.bottleneck.state.risk)}%`);
  setText("metric-energy", `${formatNumber(metrics.energy)} кВт·ч`);
  setText("metric-energy-caption", `${Math.round(metrics.energy / Math.max(metrics.throughput, 1) * 1000) / 1000} кВт·ч/кг`);
}

function renderEquipmentPanel() {
  const selected = getSelectedEquipment();

  if (!selected) {
    setText("equipment-area", "Завод 02");
    setText("equipment-name", "Оборудование не задано");
    setText("equipment-status", "PLAN");
    ["equipment-capacity", "equipment-cycle", "equipment-criticality", "equipment-power", "load-value", "risk-value"].forEach((id) => setText(id, "-"));
    document.getElementById("load-bar").style.width = "0%";
    document.getElementById("risk-bar").style.width = "0%";
    document.getElementById("tag-cloud").innerHTML = `<span>future line</span>`;
    return;
  }

  const computed = computeEquipmentState(selected);
  setText("equipment-area", selected.area);
  setText("equipment-name", selected.name);
  setText("equipment-status", computed.status === "constraint" ? "LIMIT" : computed.status === "idle" ? "IDLE" : "RUN");
  setText("equipment-capacity", `${selected.capacityKgH} кг/ч`);
  setText("equipment-cycle", selected.cycleMin ? `${selected.cycleMin} мин` : "online");
  setText("equipment-criticality", `${selected.criticality}/100`);
  setText("equipment-power", `${selected.powerKw} кВт`);
  setText("load-value", `${Math.round(computed.load)}%`);
  setText("risk-value", `${Math.round(computed.risk)}%`);
  document.getElementById("load-bar").style.width = `${clamp(computed.load, 0, 100)}%`;
  document.getElementById("risk-bar").style.width = `${clamp(computed.risk, 0, 100)}%`;
  document.getElementById("tag-cloud").innerHTML = selected.tags.map((tag) => `<span>${tag}</span>`).join("");
}

function renderInsightPanel() {
  const metrics = computeMetrics();
  const selected = getSelectedEquipment();
  const panel = document.getElementById("insight-panel");

  if (!metrics || !selected) {
    panel.innerHTML = `<p class="panel-kicker">${state.tab}</p><div class="empty-state">Здесь появятся расчетные подсказки после создания линии второго завода.</div>`;
    return;
  }

  const selectedState = computeEquipmentState(selected);
  const content = {
    ops: [
      { level: selectedState.load > 95 ? "danger" : "normal", text: `${selected.shortName}: расчетная загрузка ${Math.round(selectedState.load)}%.` },
      { level: metrics.bottleneck.item.id === selected.id ? "warning" : "normal", text: `Ограничение смены: ${metrics.bottleneck.item.name}.` },
      { level: state.cleaningEnabled ? "normal" : "warning", text: state.cleaningEnabled ? "Плановая очистка снижает риск засора и пересорта." : "Отключение очистки повышает риск качества и простоя." },
    ],
    quality: [
      { level: metrics.qualityRisk > 28 ? "warning" : "normal", text: `Индекс риска качества: ${Math.round(metrics.qualityRisk)}%.` },
      { level: selected.role === "quality" || selected.role === "screening" ? "warning" : "normal", text: "Контрольные точки: цвет, gel time, d50/d90, oversize." },
      { level: getRecipe().qualityRisk > 0.3 ? "danger" : "normal", text: `Рецептура: ${getRecipe().name}. Сложность ${getRecipe().complexity.toFixed(2)}.` },
    ],
    energy: [
      { level: selected.powerKw > 90 ? "warning" : "normal", text: `${selected.shortName}: установленная мощность ${selected.powerKw} кВт.` },
      { level: metrics.energy > 1700 ? "warning" : "normal", text: `Смена: ${formatNumber(metrics.energy)} кВт·ч при выпуске ${formatNumber(metrics.throughput)} кг.` },
      { level: "normal", text: "Приоритет оптимизации: экструдер, мельница, аспирация." },
    ],
  };

  panel.innerHTML = `
    <p class="panel-kicker">${state.tab}</p>
    <ul class="insight-list">${content[state.tab].map((item) => `<li class="${item.level}">${item.text}</li>`).join("")}</ul>
  `;
}

function renderScenarioPanel() {
  if (!state.scenarios.length) {
    refs.scenarioList.innerHTML = `<div class="empty-state">Сохраните текущий сценарий, чтобы сравнить его с другими режимами смены.</div>`;
    refs.comparePanel.innerHTML = "";
    return;
  }

  refs.scenarioList.innerHTML = state.scenarios.map((scenario) => `
    <button class="scenario-card" data-scenario-id="${scenario.id}" type="button">
      <strong>${scenario.name}</strong>
      <span>${scenario.createdAt} · ${formatNumber(scenario.metrics.throughput)} кг · ${Math.round(scenario.metrics.oee * 100)}% OEE</span>
    </button>
  `).join("");

  refs.scenarioList.querySelectorAll("[data-scenario-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.compareScenarioId = button.dataset.scenarioId;
      renderScenarioPanel();
    });
  });

  const selected = state.scenarios.find((scenario) => scenario.id === state.compareScenarioId) || state.scenarios[0];
  state.compareScenarioId = selected.id;
  const metrics = computeMetrics();

  if (!metrics) {
    refs.comparePanel.innerHTML = `
      <div class="compare-row"><span>Последний сценарий</span><strong>${selected.createdAt}</strong></div>
      <div class="compare-row"><span>Сохраненный выпуск</span><strong>${formatNumber(selected.metrics.throughput)} кг</strong></div>
      <div class="compare-row"><span>Текущий контур</span><strong>нет линии</strong></div>
    `;
    return;
  }

  const current = pickScenarioMetrics(metrics);
  const diffThroughput = current.throughput - selected.metrics.throughput;
  const diffOee = (current.oee - selected.metrics.oee) * 100;
  const diffEnergy = current.energy - selected.metrics.energy;

  refs.comparePanel.innerHTML = `
    <div class="compare-row"><span>Сравнение с</span><strong>${selected.createdAt}</strong></div>
    <div class="compare-row"><span>Выпуск</span><strong>${formatSigned(diffThroughput)} кг</strong></div>
    <div class="compare-row"><span>OEE</span><strong>${formatSigned(diffOee)} п.п.</strong></div>
    <div class="compare-row"><span>Энергия</span><strong>${formatSigned(diffEnergy)} кВт·ч</strong></div>
    <div class="compare-row"><span>Узкое место</span><strong>${current.bottleneck}</strong></div>
  `;
}

function formatSigned(value) {
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${formatNumber(rounded)}`;
}

function setText(id, value) {
  document.getElementById(id).textContent = value;
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  renderCanvas();
}

function layoutPoint(item, width, height) {
  return {
    x: 56 + item.x * Math.max(width - 112, 1),
    y: 72 + item.y * Math.max(height - 132, 1),
  };
}

function tick(timestamp) {
  if (!state.paused) state.time = timestamp;
  renderCanvas();
  if (Math.round(timestamp) % 30 === 0) {
    renderMetrics();
    renderEquipmentPanel();
  }
  requestAnimationFrame(tick);
}

function renderCanvas() {
  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  ctx.clearRect(0, 0, width, height);
  drawFloor(width, height);

  if (!getLineEquipment().length) {
    drawEmptyFactory(width, height);
    return;
  }

  drawConnections(width, height);
  drawParticles(width, height);
  drawEquipment(width, height);
}

function drawFloor(width, height) {
  ctx.save();
  ctx.globalAlpha = 0.34;
  ctx.strokeStyle = "#23364a";
  ctx.lineWidth = 1;
  for (let x = -height; x < width + height; x += 46) {
    ctx.beginPath();
    ctx.moveTo(x, height);
    ctx.lineTo(x + height, 0);
    ctx.stroke();
  }
  ctx.restore();
}

function drawEmptyFactory(width, height) {
  ctx.save();
  ctx.fillStyle = "#91a6b7";
  ctx.font = "700 18px Inter, Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Контур второго завода готов к наполнению", width / 2, height / 2);
  ctx.font = "13px Inter, Segoe UI, sans-serif";
  ctx.fillText("Добавим линии и оборудование, когда появится состав площадки", width / 2, height / 2 + 26);
  ctx.restore();
}

function drawConnections(width, height) {
  const recipe = getRecipe();
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineWidth = 10;
  ctx.strokeStyle = "rgba(145,166,183,0.18)";
  for (let index = 0; index < mainPath.length - 1; index += 1) {
    drawSegment(layoutPoint(equipment.find((item) => item.id === mainPath[index]), width, height), layoutPoint(equipment.find((item) => item.id === mainPath[index + 1]), width, height));
  }
  ctx.lineWidth = 3;
  ctx.strokeStyle = recipe.color;
  ctx.globalAlpha = 0.48;
  for (let index = 0; index < mainPath.length - 1; index += 1) {
    drawSegment(layoutPoint(equipment.find((item) => item.id === mainPath[index]), width, height), layoutPoint(equipment.find((item) => item.id === mainPath[index + 1]), width, height));
  }
  ctx.setLineDash([8, 8]);
  ctx.strokeStyle = "rgba(94,215,209,0.36)";
  ctx.lineWidth = 2;
  drawSegment(layoutPoint(equipment.find((item) => item.id === "aspiration"), width, height), layoutPoint(equipment.find((item) => item.id === "extruder"), width, height));
  drawSegment(layoutPoint(equipment.find((item) => item.id === "quality-lab"), width, height), layoutPoint(equipment.find((item) => item.id === "sieve"), width, height));
  ctx.restore();
}

function drawSegment(from, to) {
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

function drawParticles(width, height) {
  const recipe = getRecipe();
  const speed = state.paused ? 0 : 0.00012 * state.intensity;
  const phase = (state.time * speed) % 1;
  ctx.save();
  ctx.fillStyle = recipe.color;
  ctx.shadowColor = recipe.color;
  ctx.shadowBlur = 12;
  for (let index = 0; index < mainPath.length - 1; index += 1) {
    const from = layoutPoint(equipment.find((item) => item.id === mainPath[index]), width, height);
    const to = layoutPoint(equipment.find((item) => item.id === mainPath[index + 1]), width, height);
    for (let particle = 0; particle < 5; particle += 1) {
      const t = (phase + particle * 0.22 + index * 0.08) % 1;
      ctx.beginPath();
      ctx.arc(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, 2.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawEquipment(width, height) {
  getLineEquipment().forEach((item) => {
    const point = layoutPoint(item, width, height);
    const computed = computeEquipmentState(item);
    const selected = item.id === state.selectedEquipmentId;
    const color = computed.status === "constraint" ? "#f2bd58" : computed.status === "idle" ? "#78a8ff" : "#75d982";
    const boxWidth = item.role === "utility" || item.role === "quality" ? 74 : 82;
    const boxHeight = item.role === "utility" || item.role === "quality" ? 42 : 50;

    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.shadowColor = selected ? "rgba(94,215,209,0.65)" : "rgba(0,0,0,0.35)";
    ctx.shadowBlur = selected ? 24 : 12;
    ctx.fillStyle = "#172233";
    roundRect(-boxWidth / 2, -boxHeight / 2, boxWidth, boxHeight, 8);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = selected ? 2.2 : 1.4;
    ctx.stroke();
    ctx.shadowColor = "transparent";
    ctx.fillStyle = "#edf6fb";
    ctx.font = "700 11px Inter, Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(item.shortName, 0, 3, boxWidth - 12);
    ctx.fillStyle = "#91a6b7";
    ctx.font = "10px Inter, Segoe UI, sans-serif";
    ctx.fillText(`${Math.round(computed.load)}%`, 0, 17, boxWidth - 12);
    ctx.restore();
  });
}

function roundRect(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

init();
