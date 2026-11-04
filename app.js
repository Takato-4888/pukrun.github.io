const STORAGE_KEY = "pukrun-pos-v1";
const defaultState = {
  unitPrice: 200,
  materialCost: 0,
  activeDay: 1,
  sales: [],
};

const elements = {
  today: document.querySelector("#today"),
  totalSales: document.querySelector("#total-sales"),
  totalMaterialCost: document.querySelector("#total-material-cost"),
  totalProfit: document.querySelector("#total-profit"),
  totalQuantity: document.querySelector("#total-quantity"),
  dailyRows: document.querySelector("#daily-rows"),
  activeDay: document.querySelector("#active-day"),
  salePrice: document.querySelector("#sale-price"),
  displayPrice: document.querySelector("#display-price"),
  quantity: document.querySelector("#quantity"),
  checkoutTotal: document.querySelector("#checkout-total"),
  tenderAmount: document.querySelector("#tender-amount"),
  changeAmount: document.querySelector("#change-amount"),
  unitPrice: document.querySelector("#unit-price"),
  materialCost: document.querySelector("#material-cost"),
  settingsForm: document.querySelector("#settings-form"),
  settingsMessage: document.querySelector("#settings-message"),
  formMessage: document.querySelector("#form-message"),
  historyRows: document.querySelector("#history-rows"),
  emptyState: document.querySelector("#empty-state"),
  deleteSelectedSales: document.querySelector("#delete-selected-sales"),
  recordSale: document.querySelector("#record-sale"),
  error: document.querySelector("#app-error"),
};

const formatYen = (amount) =>
  `¥${new Intl.NumberFormat("ja-JP").format(amount)}`;

function isValidState(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    Number.isSafeInteger(value.unitPrice) &&
    value.unitPrice >= 0 &&
    ((Number.isSafeInteger(value.materialCost) && value.materialCost >= 0) ||
      (Number.isSafeInteger(value.unitCost) && value.unitCost >= 0)) &&
    (value.activeDay === undefined || value.activeDay === 1 || value.activeDay === 2) &&
    Array.isArray(value.sales) &&
    value.sales.every(
      (sale) =>
        sale !== null &&
        typeof sale === "object" &&
        typeof sale.id === "string" &&
        typeof sale.createdAt === "string" &&
        Number.isSafeInteger(sale.quantity) &&
        sale.quantity > 0 &&
        Number.isSafeInteger(sale.revenue) &&
        (sale.cost === undefined ||
          (Number.isSafeInteger(sale.cost) && sale.cost >= 0)) &&
        (sale.day === undefined || sale.day === 1 || sale.day === 2),
    )
  );
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === null) return { ...defaultState, sales: [] };

  const parsed = JSON.parse(saved);
  if (!isValidState(parsed)) {
    throw new Error("保存データの形式が正しくありません。データを保護するため読み込みを中止しました。");
  }
  return {
    unitPrice: parsed.unitPrice,
    materialCost:
      parsed.materialCost ??
      parsed.sales.reduce((total, sale) => total + (sale.cost ?? 0), 0),
    activeDay: parsed.activeDay ?? 1,
    sales: parsed.sales.map((sale) => ({
      id: sale.id,
      createdAt: sale.createdAt,
      day: sale.day ?? 1,
      quantity: sale.quantity,
      revenue: sale.revenue,
    })),
  };
}

let state;
let selectedPriceMode = "regular";

function getSaleUnitPrice() {
  return selectedPriceMode === "300" ? 300 : state.unitPrice;
}

function renderSalePriceOptions() {
  if (state.unitPrice === 300 && selectedPriceMode === "300") {
    selectedPriceMode = "regular";
  }

  const options = [{ value: "regular", label: `設定価格（${formatYen(state.unitPrice)}）` }];
  if (state.unitPrice !== 300) {
    options.push({ value: "300", label: "300円" });
  }

  elements.salePrice.replaceChildren();
  for (const { value, label } of options) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    elements.salePrice.append(option);
  }
  elements.salePrice.value = selectedPriceMode;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function showError(message) {
  elements.error.textContent = message;
  elements.error.hidden = false;
}

function updateCheckout() {
  const quantity = Number(elements.quantity.value);
  const validQuantity = Number.isSafeInteger(quantity) && quantity > 0;
  const unitPrice = getSaleUnitPrice();
  const total = validQuantity ? quantity * unitPrice : 0;
  const validTotal = Number.isSafeInteger(total);

  elements.checkoutTotal.textContent = formatYen(validTotal ? total : 0);
  const tender = Number(elements.tenderAmount.value);
  const validTender =
    elements.tenderAmount.value !== "" &&
    Number.isSafeInteger(tender) &&
    tender >= 0;
  if (!validQuantity || !validTotal || !validTender) {
    elements.changeAmount.textContent = "—";
  } else if (tender >= total) {
    elements.changeAmount.textContent = formatYen(tender - total);
  } else {
    elements.changeAmount.textContent = `不足 ${formatYen(total - tender)}`;
  }
  elements.recordSale.disabled =
    !validQuantity ||
    !validTotal ||
    (unitPrice === 0 && state.materialCost === 0);
}

function renderHistory() {
  const daySales = state.sales.filter((sale) => sale.day === state.activeDay);
  elements.historyRows.replaceChildren();
  elements.deleteSelectedSales.disabled = true;
  elements.emptyState.hidden = daySales.length > 0;
  elements.emptyState.textContent = `${state.activeDay}日目の販売履歴はまだありません。`;

  for (const sale of [...daySales].reverse()) {
    const row = document.createElement("tr");
    const dateCell = document.createElement("td");
    dateCell.textContent = new Intl.DateTimeFormat("ja-JP", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(sale.createdAt));

    const selectionCell = document.createElement("td");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "sale-selection";
    checkbox.dataset.saleId = sale.id;
    checkbox.setAttribute("aria-label", `${dateCell.textContent} ${sale.quantity}個の販売記録を選択`);
    selectionCell.append(checkbox);
    row.append(selectionCell);
    const values = [
      `${sale.quantity} 個`,
      formatYen(sale.revenue),
    ];
    row.append(dateCell);
    for (const value of values) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    elements.historyRows.append(row);
  }
}

function updateDeleteSelectedButton() {
  elements.deleteSelectedSales.disabled =
    !elements.historyRows.querySelector(".sale-selection:checked");
}

function render() {
  const totals = state.sales.reduce(
    (result, sale) => ({
      revenue: result.revenue + sale.revenue,
      quantity: result.quantity + sale.quantity,
    }),
    { revenue: 0, quantity: 0 },
  );

  elements.totalSales.textContent = formatYen(totals.revenue);
  elements.totalMaterialCost.textContent = formatYen(state.materialCost);
  elements.totalProfit.textContent = formatYen(totals.revenue - state.materialCost);
  elements.totalQuantity.textContent = new Intl.NumberFormat("ja-JP").format(totals.quantity);
  elements.dailyRows.replaceChildren();
  for (const day of [1, 2]) {
    const dayTotals = state.sales
      .filter((sale) => sale.day === day)
      .reduce(
        (result, sale) => ({
          revenue: result.revenue + sale.revenue,
          quantity: result.quantity + sale.quantity,
        }),
        { revenue: 0, quantity: 0 },
      );
    const row = document.createElement("tr");
    const values = [
      `${day}日目`,
      formatYen(dayTotals.revenue),
      `${new Intl.NumberFormat("ja-JP").format(dayTotals.quantity)} 個`,
    ];
    for (const value of values) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    elements.dailyRows.append(row);
  }
  elements.activeDay.value = String(state.activeDay);
  renderSalePriceOptions();
  elements.displayPrice.textContent = `${formatYen(getSaleUnitPrice())} / 個`;
  elements.unitPrice.value = String(state.unitPrice);
  elements.materialCost.value = String(state.materialCost);
  renderHistory();
  updateCheckout();
}

elements.today.textContent = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
}).format(new Date());

try {
  state = loadState();
  render();
} catch (error) {
  elements.recordSale.disabled = true;
  elements.settingsForm.querySelectorAll("input, button").forEach((control) => {
    control.disabled = true;
  });
  elements.quantity.disabled = true;
  elements.salePrice.disabled = true;
  document.querySelectorAll(".step-button").forEach((button) => {
    button.disabled = true;
  });
  elements.activeDay.disabled = true;
  showError(`データを読み込めませんでした: ${error.message}`);
}

elements.quantity.addEventListener("input", updateCheckout);
elements.tenderAmount.addEventListener("input", updateCheckout);
elements.salePrice.addEventListener("change", () => {
  selectedPriceMode = elements.salePrice.value === "300" ? "300" : "regular";
  elements.displayPrice.textContent = `${formatYen(getSaleUnitPrice())} / 個`;
  updateCheckout();
});
elements.activeDay.addEventListener("change", () => {
  const previousDay = state.activeDay;
  state.activeDay = Number(elements.activeDay.value);
  try {
    saveState();
    elements.formMessage.textContent = "";
    renderHistory();
  } catch (error) {
    state.activeDay = previousDay;
    elements.activeDay.value = String(previousDay);
    showError(`営業日の切り替えを保存できませんでした: ${error.message}`);
  }
});
document.querySelector("#decrease").addEventListener("click", () => {
  const quantity = Number(elements.quantity.value);
  elements.quantity.value = String(Math.max(1, (Number.isSafeInteger(quantity) ? quantity : 1) - 1));
  updateCheckout();
});
document.querySelector("#increase").addEventListener("click", () => {
  const quantity = Number(elements.quantity.value);
  if (!Number.isSafeInteger(quantity) || quantity >= Number.MAX_SAFE_INTEGER) return;
  elements.quantity.value = String(quantity + 1);
  updateCheckout();
});

elements.settingsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const unitPrice = Number(elements.unitPrice.value);
  const materialCost = Number(elements.materialCost.value);
  if (
    !Number.isSafeInteger(unitPrice) ||
    unitPrice < 0 ||
    !Number.isSafeInteger(materialCost) ||
    materialCost < 0
  ) {
    elements.settingsMessage.textContent = "0円以上の整数を入力してください。";
    return;
  }

  const previous = { unitPrice: state.unitPrice, materialCost: state.materialCost };
  state.unitPrice = unitPrice;
  state.materialCost = materialCost;
  try {
    saveState();
    elements.settingsMessage.textContent = "設定を保存しました。";
    elements.formMessage.textContent = "";
    render();
  } catch (error) {
    state = { ...state, ...previous };
    elements.settingsMessage.textContent = "";
    showError(`設定を保存できませんでした: ${error.message}`);
    render();
  }
});

elements.recordSale.addEventListener("click", () => {
  const quantity = Number(elements.quantity.value);
  const unitPrice = getSaleUnitPrice();
  const revenue = quantity * unitPrice;
  if (
    !Number.isSafeInteger(quantity) ||
    quantity <= 0 ||
    !Number.isSafeInteger(revenue) ||
    (unitPrice === 0 && state.materialCost === 0)
  ) {
    elements.formMessage.textContent = "販売数と価格設定を確認してください。";
    return;
  }

  const sale = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    day: state.activeDay,
    quantity,
    revenue,
  };
  state.sales.push(sale);
  try {
    saveState();
    elements.formMessage.textContent = "販売を記録しました。";
    elements.quantity.value = "1";
    elements.tenderAmount.value = "";
    render();
  } catch (error) {
    state.sales.pop();
    showError(`販売を記録できませんでした: ${error.message}`);
  }
});

elements.historyRows.addEventListener("change", (event) => {
  if (event.target instanceof HTMLInputElement && event.target.matches(".sale-selection")) {
    updateDeleteSelectedButton();
  }
});

elements.deleteSelectedSales.addEventListener("click", () => {
  const selectedIds = [...elements.historyRows.querySelectorAll(".sale-selection:checked")]
    .map((checkbox) => checkbox.dataset.saleId)
    .filter((saleId) => saleId !== undefined);
  if (selectedIds.length === 0) return;
  if (!window.confirm(`選択した販売記録 ${selectedIds.length}件だけを削除します。よろしいですか？`)) return;

  const selectedIdSet = new Set(selectedIds);
  const previousSales = state.sales;
  state.sales = state.sales.filter((sale) => !selectedIdSet.has(sale.id));
  try {
    saveState();
    elements.formMessage.textContent = `販売記録を${selectedIds.length}件削除しました。`;
    render();
  } catch (error) {
    state.sales = previousSales;
    showError(`選択した販売記録を削除できませんでした: ${error.message}`);
    render();
    for (const checkbox of elements.historyRows.querySelectorAll(".sale-selection")) {
      if (checkbox.dataset.saleId && selectedIdSet.has(checkbox.dataset.saleId)) {
        checkbox.checked = true;
      }
    }
    updateDeleteSelectedButton();
  }
});
