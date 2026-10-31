const STORAGE_KEY = "pukrun-pos-v1";
const defaultState = {
  unitPrice: 200,
  unitCost: 0,
  activeDay: 1,
  sales: [],
};

const elements = {
  today: document.querySelector("#today"),
  totalSales: document.querySelector("#total-sales"),
  totalCost: document.querySelector("#total-cost"),
  totalProfit: document.querySelector("#total-profit"),
  totalQuantity: document.querySelector("#total-quantity"),
  dailyRows: document.querySelector("#daily-rows"),
  activeDay: document.querySelector("#active-day"),
  displayPrice: document.querySelector("#display-price"),
  quantity: document.querySelector("#quantity"),
  checkoutTotal: document.querySelector("#checkout-total"),
  unitPrice: document.querySelector("#unit-price"),
  unitCost: document.querySelector("#unit-cost"),
  settingsForm: document.querySelector("#settings-form"),
  settingsMessage: document.querySelector("#settings-message"),
  formMessage: document.querySelector("#form-message"),
  historyRows: document.querySelector("#history-rows"),
  emptyState: document.querySelector("#empty-state"),
  clearHistory: document.querySelector("#clear-history"),
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
    Number.isSafeInteger(value.unitCost) &&
    value.unitCost >= 0 &&
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
        Number.isSafeInteger(sale.cost) &&
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
    ...parsed,
    activeDay: parsed.activeDay ?? 1,
    sales: parsed.sales.map((sale) => ({ ...sale, day: sale.day ?? 1 })),
  };
}

let state;

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
  const total = validQuantity ? quantity * state.unitPrice : 0;
  const validTotal = Number.isSafeInteger(total);

  elements.checkoutTotal.textContent = formatYen(validTotal ? total : 0);
  elements.recordSale.disabled =
    !validQuantity ||
    !validTotal ||
    (state.unitPrice === 0 && state.unitCost === 0);
}

function renderHistory() {
  const daySales = state.sales.filter((sale) => sale.day === state.activeDay);
  elements.historyRows.replaceChildren();
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

    const values = [
      `${sale.quantity} 個`,
      formatYen(sale.revenue),
      formatYen(sale.cost),
      formatYen(sale.revenue - sale.cost),
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

function render() {
  const totals = state.sales.reduce(
    (result, sale) => ({
      revenue: result.revenue + sale.revenue,
      cost: result.cost + sale.cost,
      quantity: result.quantity + sale.quantity,
    }),
    { revenue: 0, cost: 0, quantity: 0 },
  );

  elements.totalSales.textContent = formatYen(totals.revenue);
  elements.totalCost.textContent = formatYen(totals.cost);
  elements.totalProfit.textContent = formatYen(totals.revenue - totals.cost);
  elements.totalQuantity.textContent = new Intl.NumberFormat("ja-JP").format(totals.quantity);
  elements.dailyRows.replaceChildren();
  for (const day of [1, 2]) {
    const dayTotals = state.sales
      .filter((sale) => sale.day === day)
      .reduce(
        (result, sale) => ({
          revenue: result.revenue + sale.revenue,
          cost: result.cost + sale.cost,
          quantity: result.quantity + sale.quantity,
        }),
        { revenue: 0, cost: 0, quantity: 0 },
      );
    const row = document.createElement("tr");
    const values = [
      `${day}日目`,
      formatYen(dayTotals.revenue),
      formatYen(dayTotals.cost),
      formatYen(dayTotals.revenue - dayTotals.cost),
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
  elements.displayPrice.textContent = `${formatYen(state.unitPrice)} / 個`;
  elements.unitPrice.value = String(state.unitPrice);
  elements.unitCost.value = String(state.unitCost);
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
  document.querySelectorAll(".step-button").forEach((button) => {
    button.disabled = true;
  });
  elements.clearHistory.disabled = true;
  elements.activeDay.disabled = true;
  showError(`データを読み込めませんでした: ${error.message}`);
}

elements.quantity.addEventListener("input", updateCheckout);
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
  const unitCost = Number(elements.unitCost.value);
  if (
    !Number.isSafeInteger(unitPrice) ||
    unitPrice < 0 ||
    !Number.isSafeInteger(unitCost) ||
    unitCost < 0
  ) {
    elements.settingsMessage.textContent = "0円以上の整数を入力してください。";
    return;
  }

  const previous = { unitPrice: state.unitPrice, unitCost: state.unitCost };
  state.unitPrice = unitPrice;
  state.unitCost = unitCost;
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
  const revenue = quantity * state.unitPrice;
  const cost = quantity * state.unitCost;
  if (
    !Number.isSafeInteger(quantity) ||
    quantity <= 0 ||
    !Number.isSafeInteger(revenue) ||
    !Number.isSafeInteger(cost) ||
    (state.unitPrice === 0 && state.unitCost === 0)
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
    cost,
  };
  state.sales.push(sale);
  try {
    saveState();
    elements.formMessage.textContent = "販売を記録しました。";
    elements.quantity.value = "1";
    render();
  } catch (error) {
    state.sales.pop();
    showError(`販売を記録できませんでした: ${error.message}`);
  }
});

elements.clearHistory.addEventListener("click", () => {
  const daySales = state.sales.filter((sale) => sale.day === state.activeDay);
  if (daySales.length === 0) return;
  if (!window.confirm(`${state.activeDay}日目の販売履歴を削除します。この操作は取り消せません。`)) return;

  const previousSales = state.sales;
  state.sales = state.sales.filter((sale) => sale.day !== state.activeDay);
  try {
    saveState();
    elements.formMessage.textContent = "";
    render();
  } catch (error) {
    state.sales = previousSales;
    showError(`履歴を削除できませんでした: ${error.message}`);
    render();
  }
});
