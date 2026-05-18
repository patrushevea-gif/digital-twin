(() => {
  const factories = [
    {
      id: "factory-1",
      name: "Завод 01",
      place: "Цех покрытий",
      lines: [
        { id: "powder", name: "Линия порошковой краски", short: "Порошковая краска", status: "connected", note: "Line Twin MVP активен" },
        { id: "liquid", name: "Линия жидких ЛКМ", short: "Жидкие ЛКМ", status: "locked", note: "ожидает паспорт линии" },
        { id: "packing-line", name: "Линия фасовки и маркировки", short: "Фасовка", status: "locked", note: "ожидает маршрут и KPI" }
      ]
    },
    {
      id: "factory-2",
      name: "Завод 02",
      place: "Будущий контур",
      lines: [
        { id: "factory2-powder", name: "Линия порошковой краски", short: "Порошковая краска", status: "locked", note: "ожидает паспорта оборудования" },
        { id: "factory2-mix", name: "Линия подготовки сырья", short: "Подготовка сырья", status: "locked", note: "ожидает маршрут процесса" },
        { id: "factory2-pack", name: "Линия фасовки", short: "Фасовка", status: "locked", note: "ожидает историю смен" }
      ]
    }
  ];

  const state = { selectedFactory: "factory-1", activeFactory: "factory-1", activeLine: "powder" };
  const byId = (id) => document.getElementById(id);
  const selectedFactory = () => factories.find((factory) => factory.id === state.selectedFactory) || factories[0];
  const activeFactory = () => factories.find((factory) => factory.id === state.activeFactory) || factories[0];
  const activeLine = () => activeFactory().lines.find((line) => line.id === state.activeLine) || activeFactory().lines[0];

  function renderFactoryHub() {
    const viewed = selectedFactory();
    const factoryTabs = byId("factoryTabs");
    const lineCatalog = byId("lineCatalog");
    const factoryStatus = byId("factoryStatus");
    const assetSummary = byId("assetSummary");
    const activeAssetPill = byId("activeAssetPill");
    if (!factoryTabs || !lineCatalog || !factoryStatus || !assetSummary) return;

    factoryTabs.innerHTML = factories.map((factory) => `
      <button class="factory-tab ${factory.id === viewed.id ? "active" : ""}" type="button" data-factory="${factory.id}">
        <strong>${factory.name}</strong>
        <span>${factory.place}</span>
      </button>
    `).join("");

    lineCatalog.innerHTML = viewed.lines.map((line, index) => {
      const connected = viewed.id === state.activeFactory && line.id === state.activeLine && line.status === "connected";
      const classes = ["line-tile", connected ? "connected" : "", line.status === "locked" ? "locked" : ""].join(" ");
      const status = connected ? "активна" : "пока не подключена";
      return `
        <button class="${classes}" type="button" data-line="${line.id}" ${line.status === "locked" ? "aria-disabled=\"true\"" : ""}>
          <span class="line-index">${index + 1}</span>
          <strong>${line.name}</strong>
          <small>${line.note}</small>
          <em>${status}</em>
        </button>
      `;
    }).join("");

    const connectedCount = factories.flatMap((factory) => factory.lines).filter((line) => line.status === "connected").length;
    factoryStatus.textContent = viewed.id === state.activeFactory ? "Открыт первый цифровой двойник" : `${viewed.name}: линии ждут данных`;
    assetSummary.innerHTML = `
      <strong>Сейчас в расчете: ${activeFactory().name} / ${activeLine().name}</strong>
      <span>${connectedCount} из 6 линий подключена. Остальные пять заранее заложены в структуру платформы и будут включаться по мере появления паспортов оборудования, рецептур и истории смен.</span>
    `;
    if (activeAssetPill) activeAssetPill.textContent = `${activeFactory().name} / ${activeLine().short}`;
  }

  document.addEventListener("click", (event) => {
    const factoryButton = event.target.closest("[data-factory]");
    if (factoryButton) {
      state.selectedFactory = factoryButton.dataset.factory;
      renderFactoryHub();
      return;
    }

    const lineButton = event.target.closest("[data-line]");
    if (!lineButton || !lineButton.closest("#factoryHub")) return;
    if (lineButton.classList.contains("locked")) {
      const messages = byId("messages");
      if (messages) {
        const note = document.createElement("div");
        note.className = "message";
        note.textContent = "Эта линия пока не подключена. Для запуска двойника понадобятся паспорт оборудования, маршрут, рецептуры и история смен.";
        messages.appendChild(note);
        messages.scrollTop = messages.scrollHeight;
      }
      return;
    }

    state.activeFactory = state.selectedFactory;
    state.activeLine = lineButton.dataset.line;
    renderFactoryHub();
  });

  renderFactoryHub();
})();
