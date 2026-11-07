import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { supabaseConfig } from "./supabase-config.js";

const supabase = createClient(supabaseConfig.url, supabaseConfig.publishableKey);

const STORAGE_KEY = "pukrun-pos-v1";
const defaultState = {
  unitPrice: 200,
  materialCosts: [],
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
  settingsForm: document.querySelector("#settings-form"),
  settingsMessage: document.querySelector("#settings-message"),
  materialForm: document.querySelector("#material-form"),
  materialName: document.querySelector("#material-name"),
  materialAmount: document.querySelector("#material-amount"),
  materialMessage: document.querySelector("#material-message"),
  materialRows: document.querySelector("#material-rows"),
  materialEmptyState: document.querySelector("#material-empty-state"),
  deleteSelectedMaterials: document.querySelector("#delete-selected-materials"),
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
  const validMaterialCosts =
    Array.isArray(value?.materialCosts) &&
    value.materialCosts.every(
      (item) =>
        item !== null &&
        typeof item === "object" &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        item.name.trim().length > 0 &&
        Number.isSafeInteger(item.amount) &&
        item.amount >= 0 &&
        (item.createdAt === null || typeof item.createdAt === "string"),
    ) &&
    Number.isSafeInteger(
      value.materialCosts.reduce((total, item) => total + item.amount, 0),
    );
  const validLegacyMaterialCost =
    (Number.isSafeInteger(value?.materialCost) && value.materialCost >= 0) ||
    (Number.isSafeInteger(value?.unitCost) && value.unitCost >= 0);

  return (
    value !== null &&
    typeof value === "object" &&
    Number.isSafeInteger(value.unitPrice) &&
    value.unitPrice >= 0 &&
    (validMaterialCosts || (!Array.isArray(value.materialCosts) && validLegacyMaterialCost)) &&
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

function normalizeState(parsed) {
  if (!isValidState(parsed)) {
    throw new Error("保存データの形式が正しくありません。データを保護するため読み込みを中止しました。");
  }
  return {
    unitPrice: parsed.unitPrice,
    materialCosts:
      parsed.materialCosts ??
      (() => {
        const amount =
          parsed.materialCost ??
          parsed.unitCost ??
          parsed.sales.reduce((total, sale) => total + (sale.cost ?? 0), 0);
        return amount > 0
          ? [{ id: "legacy-material-cost", name: "これまでの材料費", amount, createdAt: null }]
          : [];
      })(),
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

function loadLocalState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === null) return { ...defaultState, sales: [] };

  return normalizeState(JSON.parse(saved));
}

let state;
let selectedPriceMode = "regular";
let databaseReady = false;

function getSaleUnitPrice() {
  return selectedPriceMode === "300" ? 300 : state.unitPrice;
}

function getMaterialCostTotal() {
  return state.materialCosts.reduce((total, item) => total + item.amount, 0);
}

function renderSalePriceOptions() {
  if (state.unitPrice === 300 && selectedPriceMode === "300") {
    selectedPriceMode = "regular";
  }

  const options = [
    {
      value: "regular",
      label: `${new Intl.NumberFormat("ja-JP").format(state.unitPrice)}円`,
    },
  ];
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

async function updateSharedState(action, payload) {
  if (!databaseReady) {
    throw new Error("共有データベースの接続が完了していません。");
  }

  const { data, error } = await supabase.rpc("update_pukrun_state", {
    p_action: action,
    p_payload: payload,
  });
  if (error) throw error;
  state = normalizeState(data);
  render();
}

function setDatabaseReady(ready) {
  databaseReady = ready;
  document
    .querySelectorAll(
      "form input, form button, #active-day, #sale-price, #quantity, #tender-amount, .step-button, #delete-selected-sales, #delete-selected-materials",
    )
    .forEach((control) => {
      control.disabled = !ready;
    });
  if (ready) render();
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
    !databaseReady ||
    !validQuantity ||
    !validTotal ||
    (unitPrice === 0 && getMaterialCostTotal() === 0);
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

function renderMaterialHistory() {
  elements.materialRows.replaceChildren();
  elements.deleteSelectedMaterials.disabled = true;
  elements.materialEmptyState.hidden = state.materialCosts.length > 0;

  for (const item of [...state.materialCosts].reverse()) {
    const row = document.createElement("tr");
    const selectionCell = document.createElement("td");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "material-selection sale-selection";
    checkbox.dataset.materialId = item.id;
    checkbox.setAttribute("aria-label", `${item.name} ${formatYen(item.amount)}の材料費記録を選択`);
    checkbox.addEventListener("change", updateDeleteSelectedMaterialsButton);
    selectionCell.append(checkbox);
    const dateCell = document.createElement("td");
    dateCell.textContent = item.createdAt
      ? new Intl.DateTimeFormat("ja-JP", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(item.createdAt))
      : "—";
    const nameCell = document.createElement("td");
    nameCell.textContent = item.name;
    const amountCell = document.createElement("td");
    amountCell.textContent = formatYen(item.amount);
    row.append(selectionCell, dateCell, nameCell, amountCell);
    elements.materialRows.append(row);
  }
}

function updateDeleteSelectedMaterialsButton() {
  elements.deleteSelectedMaterials.disabled =
    !elements.materialRows.querySelector(".material-selection:checked");
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
  const materialCost = getMaterialCostTotal();
  elements.totalMaterialCost.textContent = formatYen(materialCost);
  elements.totalProfit.textContent = formatYen(totals.revenue - materialCost);
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
  elements.displayPrice.textContent = `${formatYen(getSaleUnitPrice())} / 本`;
  elements.unitPrice.value = String(state.unitPrice);
  renderHistory();
  renderMaterialHistory();
  updateCheckout();
}

elements.today.textContent = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
}).format(new Date());

async function connectToSharedState() {
  if (
    supabaseConfig.url === "YOUR_SUPABASE_URL" ||
    supabaseConfig.publishableKey === "YOUR_SUPABASE_PUBLISHABLE_KEY"
  ) {
    throw new Error("supabase-config.js にSupabaseの設定を入力してください。");
  }

  const { data: initializedState, error: initializeError } = await supabase.rpc(
    "initialize_pukrun_state",
    { p_state: loadLocalState() },
  );
  if (initializeError) throw initializeError;
  state = normalizeState(initializedState);

  supabase
    .channel("pukrun-shared-state")
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "pukrun_state", filter: "id=eq.1" },
      (payload) => {
        try {
          state = normalizeState(payload.new.state);
          render();
          elements.error.hidden = true;
        } catch (error) {
          setDatabaseReady(false);
          showError(`共有データを読み込めませんでした: ${error.message}`);
        }
      },
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        showError("リアルタイム更新に接続できませんでした。Supabaseの設定を確認してください。");
      }
    });

  const { data: current, error: readError } = await supabase
    .from("pukrun_state")
    .select("state")
    .eq("id", 1)
    .single();
  if (readError) throw readError;
  try {
    state = normalizeState(current.state);
  } catch (error) {
    setDatabaseReady(false);
    throw error;
  }
  setDatabaseReady(true);
}

setDatabaseReady(false);
connectToSharedState().catch((error) => {
  showError(`共有データベースに接続できませんでした: ${error.message}`);
  setDatabaseReady(false);
});

elements.quantity.addEventListener("input", updateCheckout);
elements.tenderAmount.addEventListener("input", updateCheckout);
elements.salePrice.addEventListener("change", () => {
  selectedPriceMode = elements.salePrice.value === "300" ? "300" : "regular";
  elements.displayPrice.textContent = `${formatYen(getSaleUnitPrice())} / 本`;
  updateCheckout();
});
elements.activeDay.addEventListener("change", () => {
  const previousDay = state.activeDay;
  const activeDay = Number(elements.activeDay.value);
  updateSharedState("set_active_day", { value: activeDay }).then(() => {
    elements.formMessage.textContent = "";
  }).catch((error) => {
    elements.activeDay.value = String(previousDay);
    showError(`営業日の切り替えを保存できませんでした: ${error.message}`);
  });
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
  if (!Number.isSafeInteger(unitPrice) || unitPrice < 0) {
    elements.settingsMessage.textContent = "販売価格は0円以上の整数を入力してください。";
    return;
  }

  updateSharedState("set_unit_price", { value: unitPrice }).then(() => {
    elements.settingsMessage.textContent = "設定を保存しました。";
    elements.formMessage.textContent = "";
  }).catch((error) => {
    elements.settingsMessage.textContent = "";
    showError(`設定を保存できませんでした: ${error.message}`);
    render();
  });
});

elements.materialForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = elements.materialName.value.trim();
  const amount = Number(elements.materialAmount.value);
  if (!name || !Number.isSafeInteger(amount) || amount < 0) {
    elements.materialMessage.textContent = "材料名と0円以上の整数を入力してください。";
    return;
  }
  if (!Number.isSafeInteger(getMaterialCostTotal() + amount)) {
    elements.materialMessage.textContent = "材料費の合計が大きすぎます。金額を確認してください。";
    return;
  }

  const item = {
    id: crypto.randomUUID(),
    name,
    amount,
    createdAt: new Date().toISOString(),
  };
  updateSharedState("add_material", item).then(() => {
    elements.materialMessage.textContent = "材料費を追加しました。";
    elements.materialName.value = "";
    elements.materialAmount.value = "";
  }).catch((error) => {
    showError(`材料費を保存できませんでした: ${error.message}`);
  });
});

elements.deleteSelectedMaterials.addEventListener("click", () => {
  const selectedIds = [...elements.materialRows.querySelectorAll(".material-selection:checked")]
    .map((checkbox) => checkbox.dataset.materialId)
    .filter((materialId) => materialId !== undefined);
  if (selectedIds.length === 0) return;
  if (!window.confirm(`選択した材料費の記録 ${selectedIds.length}件だけを削除します。よろしいですか？`)) return;

  const selectedIdSet = new Set(selectedIds);
  updateSharedState("delete_materials", { ids: [...selectedIdSet] }).then(() => {
    elements.materialMessage.textContent = `材料費の記録を${selectedIds.length}件削除しました。`;
  }).catch((error) => {
    showError(`選択した材料費を削除できませんでした: ${error.message}`);
    render();
    for (const checkbox of elements.materialRows.querySelectorAll(".material-selection")) {
      if (checkbox.dataset.materialId && selectedIdSet.has(checkbox.dataset.materialId)) {
        checkbox.checked = true;
      }
    }
    updateDeleteSelectedMaterialsButton();
  });
});

elements.recordSale.addEventListener("click", () => {
  const quantity = Number(elements.quantity.value);
  const unitPrice = getSaleUnitPrice();
  const revenue = quantity * unitPrice;
  if (
    !Number.isSafeInteger(quantity) ||
    quantity <= 0 ||
    !Number.isSafeInteger(revenue) ||
    (unitPrice === 0 && getMaterialCostTotal() === 0)
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
  updateSharedState("add_sale", sale).then(() => {
    elements.formMessage.textContent = "販売を記録しました。";
    elements.quantity.value = "1";
    elements.tenderAmount.value = "";
    updateCheckout();
  }).catch((error) => {
    showError(`販売を記録できませんでした: ${error.message}`);
  });
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
  updateSharedState("delete_sales", { ids: [...selectedIdSet] }).then(() => {
    elements.formMessage.textContent = `販売記録を${selectedIds.length}件削除しました。`;
  }).catch((error) => {
    showError(`選択した販売記録を削除できませんでした: ${error.message}`);
    render();
    for (const checkbox of elements.historyRows.querySelectorAll(".sale-selection")) {
      if (checkbox.dataset.saleId && selectedIdSet.has(checkbox.dataset.saleId)) {
        checkbox.checked = true;
      }
    }
    updateDeleteSelectedButton();
  });
});
