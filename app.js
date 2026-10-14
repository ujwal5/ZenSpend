
"use strict";

/* =========================================================
   ZenSpend ₹ — Personal Finance Tracker
   Home • Add • Analysis
   Storage: this browser/device only
   No external libraries or data-upload requests required.
   ========================================================= */

const ZenSpend = (() => {
  const STORAGE_KEY = "zenspend.transactions.v2";
  const BUDGET_KEY = "zenspend.budgets.v2";
  const SETTINGS_KEY = "zenspend.settings.v2";

  const CATEGORIES = {
    expense: [
      "Food & Dining", "Groceries", "Transport", "Fuel",
      "Shopping", "Bills & Utilities", "Rent", "Health",
      "Entertainment", "Education", "Travel", "EMI & Loans",
      "Family", "Personal Care", "Subscriptions", "Other Expense"
    ],
    income: [
      "Salary", "Freelance", "Business", "Interest",
      "Investment Returns", "Refund", "Gift", "Other Income"
    ]
  };

  const COLORS = [
    "#62d3e4", "#b7f28b", "#f6c667", "#b9a5ff",
    "#ff9c91", "#7dd3a7", "#72a7ff", "#e8a8d8",
    "#e8e9a5", "#85c7bc", "#ffa96b", "#a8b7c5"
  ];

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const makeId = () =>
    globalThis.crypto?.randomUUID?.() ||
    `tx-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);

  const money = amount => new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(Number(amount) || 0);

  const shortMoney = amount => {
    const value = Number(amount) || 0;
    if (Math.abs(value) >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
    if (Math.abs(value) >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
    if (Math.abs(value) >= 1000) return `₹${(value / 1000).toFixed(1)}k`;
    return `₹${Math.round(value).toLocaleString("en-IN")}`;
  };

  const fmtDate = date => {
    if (!date) return "—";
    const parsed = new Date(`${date}T12:00:00`);
    return Number.isNaN(parsed.getTime())
      ? date
      : parsed.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  };

  const fmtMonth = date => {
    const parsed = new Date(`${date}T12:00:00`);
    return Number.isNaN(parsed.getTime())
      ? date
      : parsed.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  };

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (error) {
      console.error(`ZenSpend: unable to read ${key}`, error);
      return fallback;
    }
  }

  let transactions = readJSON(STORAGE_KEY, []);
  let budgets = readJSON(BUDGET_KEY, {});
  let settings = readJSON(SETTINGS_KEY, { period: "week", reportDate: today() });
  let currentView = "home";
  let editingId = null;
  let activeType = "expense";
  let chartObserver = null;

  if (!Array.isArray(transactions)) transactions = [];
  if (!budgets || typeof budgets !== "object" || Array.isArray(budgets)) budgets = {};
  if (!settings || typeof settings !== "object") settings = { period: "week", reportDate: today() };

  transactions = transactions
    .filter(tx => tx && typeof tx === "object")
    .map(tx => ({
      id: String(tx.id || makeId()),
      type: tx.type === "income" ? "income" : "expense",
      amount: Math.max(0, Number(tx.amount) || 0),
      description: String(tx.description || tx.note || "Untitled transaction"),
      category: String(tx.category || "Other Expense"),
      date: /^\d{4}-\d{2}-\d{2}$/.test(tx.date || "") ? tx.date : today(),
      payment: String(tx.payment || "Other"),
      notes: String(tx.notes || ""),
      createdAt: Number(tx.createdAt) || Date.now()
    }))
    .filter(tx => tx.amount > 0);

  function persistTransactions() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
      return true;
    } catch (error) {
      alert("ZenSpend could not save your data. Your browser storage may be full or disabled. Export a backup if possible.");
      console.error(error);
      return false;
    }
  }

  function persistBudgets() {
    try {
      localStorage.setItem(BUDGET_KEY, JSON.stringify(budgets));
      return true;
    } catch (error) {
      alert("Your budgets could not be saved in this browser.");
      console.error(error);
      return false;
    }
  }

  function persistSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error("Unable to save settings", error);
    }
  }

  function sumType(list, type) {
    return list.reduce((total, tx) => total + (tx.type === type ? tx.amount : 0), 0);
  }

  function getPeriodBounds(period = settings.period, date = settings.reportDate || today()) {
    const selected = new Date(`${date}T12:00:00`);
    if (Number.isNaN(selected.getTime())) return getPeriodBounds(period, today());

    let start;
    let end;

    if (period === "month") {
      start = new Date(selected.getFullYear(), selected.getMonth(), 1);
      end = new Date(selected.getFullYear(), selected.getMonth() + 1, 0);
    } else {
      const day = selected.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      start = new Date(selected);
      start.setDate(selected.getDate() + mondayOffset);
      end = new Date(start);
      end.setDate(start.getDate() + 6);
    }

    const toISO = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    return { start: toISO(start), end: toISO(end) };
  }

  function periodTransactions(period = settings.period, date = settings.reportDate || today()) {
    const { start, end } = getPeriodBounds(period, date);
    return transactions.filter(tx => tx.date >= start && tx.date <= end);
  }

  function monthTransactions(date = settings.reportDate || today()) {
    return periodTransactions("month", date);
  }

  function updateText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  function setHTML(id, html) {
    const element = document.getElementById(id);
    if (element) element.innerHTML = html;
  }

  function toast(message) {
    let element = $("#toast");

    if (!element) {
      element = document.createElement("div");
      element.id = "toast";
      element.setAttribute("role", "status");
      Object.assign(element.style, {
        position: "fixed",
        left: "50%",
        bottom: "95px",
        transform: "translateX(-50%)",
        zIndex: "1000",
        maxWidth: "calc(100% - 32px)",
        padding: "12px 18px",
        borderRadius: "14px",
        background: "#263833",
        color: "#ffffff",
        border: "1px solid #4c665b",
        boxShadow: "0 8px 30px #0005",
        fontSize: "13px",
        textAlign: "center",
        display: "none"
      });
      document.body.appendChild(element);
    }

    element.textContent = message;
    element.style.display = "block";

    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => {
      element.style.display = "none";
    }, 2800);
  }

  /* ---------------- Navigation ---------------- */

  function showView(name) {
    if (!["home", "add", "analysis"].includes(name)) return;
    currentView = name;

    $$(".app-view").forEach(view => {
      view.classList.toggle("active", view.id === `${name}-view`);
    });

    $$(".nav-item").forEach(button => {
      const active = button.dataset.view === name;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });

    if (name === "home") renderHome();
    if (name === "add") renderAddOverview();
    if (name === "analysis") renderAnalysis();

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openAdd(type = "expense", transaction = null) {
    activeType = type === "income" ? "income" : "expense";
    editingId = transaction?.id || null;
    showView("add");
    renderAddForm(transaction);
  }

  /* ---------------- Home screen ---------------- */

  
function renderHome() {
  const current = periodTransactions();

  const income = sumType(current, "income");
  const expense = sumType(current, "expense");
  const net = income - expense;
  const rate = income > 0 ? (net / income) * 100 : null;

  // Calculate all-time current balance
  const allTimeIncome = sumType(transactions, "income");
  const allTimeExpenses = sumType(transactions, "expense");
  const currentBalance = allTimeIncome - allTimeExpenses;

  // Update summary cards
  updateText("incomeTotal", money(income));
  updateText("expenseTotal", money(expense));
  updateText("netTotal", money(net));
  updateText(
    "savingsRate",
    rate === null ? "—" : `${rate.toFixed(1)}%`
  );

  // Update current balance card
  updateText("currentBalance", money(currentBalance));

  const balanceElement = $("#currentBalance");

  if (balanceElement) {
    balanceElement.style.color =
      currentBalance >= 0 ? "#b7f28b" : "#ff9c91";
  }

}

    updateText("todayLabel", new Date().toLocaleDateString("en-IN", {
      weekday: "long", day: "numeric", month: "long"
    }));

    updateText("incomeTotal", money(income));
    updateText("expenseTotal", money(expense));
    updateText("netTotal", money(net));
    updateText("savingsRate", rate === null ? "—" : `${rate.toFixed(1)}%`);

    updateText("incomeCaption", settings.period === "month" ? "This month" : "This week");
    updateText("expenseCaption", settings.period === "month" ? "This month" : "This week");
    updateText("netCaption", net >= 0 ? "Positive cash flow" : "Spending exceeds income");

    const netElement = $("#netTotal");
    if (netElement) netElement.style.color = net >= 0 ? "#b7f28b" : "#ff9c91";

    renderHomeRecent();
    renderAddOverview();
  }

  function renderHomeRecent() {
    const target = $("#homeRecent");
    if (!target) return;

    const list = [...transactions]
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
      .slice(0, 6);

    if (!list.length) {
      target.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">₹</span>
          <h3>Your money story starts here</h3>
          <p>Add your first income or expense.</p>
          <button class="btn btn-primary" data-action="add">＋ Add transaction</button>
        </div>`;
      return;
    }

    target.innerHTML = list.map(tx => `
      <div class="home-recent-row">
        <span class="recent-symbol">${tx.type === "income" ? "↙" : "↗"}</span>
        <span class="recent-description">
          <strong>${escapeHTML(tx.description)}</strong>
          <small>${escapeHTML(tx.category)} · ${fmtDate(tx.date)}</small>
        </span>
        <span class="recent-amount ${tx.type}">
          ${tx.type === "income" ? "+" : "−"}${money(tx.amount)}
        </span>
      </div>`).join("");
  }

  /* ---------------- Add screen ---------------- */

  function renderAddOverview() {
    const current = periodTransactions();
    updateText("addIncomeTotal", money(sumType(current, "income")));
    updateText("addExpenseTotal", money(sumType(current, "expense")));
  }

  function ensureAddForm() {
    const view = $("#add-view");
    if (!view || $("#transactionForm")) return;

    const form = document.createElement("form");
    form.id = "transactionForm";
    form.className = "panel transaction-form";
    form.innerHTML = `
      <div class="section-head">
        <div>
          <p class="eyebrow">NEW ENTRY</p>
          <h2 id="formHeading">Record expense</h2>
        </div>
        <button type="button" class="btn btn-quiet btn-small" data-action="cancel-edit">Reset</button>
      </div>

      <div class="type-switch">
        <button type="button" class="type-choice active" data-type="expense">↗ Expense</button>
        <button type="button" class="type-choice" data-type="income">↙ Income</button>
      </div>

      <label class="field">
        <span>Amount (₹)</span>
        <input id="txAmount" name="amount" type="number" inputmode="decimal"
          min="0.01" step="0.01" placeholder="0.00" required>
      </label>

      <div class="form-grid">
        <label class="field">
          <span>Description</span>
          <input id="txDescription" name="description" maxlength="100"
            placeholder="e.g. Monthly salary, lunch" required>
        </label>
        <label class="field">
          <span>Date</span>
          <input id="txDate" name="date" type="date" required>
        </label>
        <label class="field">
          <span>Category</span>
          <select id="txCategory" name="category" required></select>
        </label>
        <label class="field">
          <span>Payment method</span>
          <select id="txPayment" name="payment">
            <option>Bank</option><option>Cash</option><option>UPI</option>
            <option>Credit Card</option><option>Debit Card</option>
            <option>Wallet</option><option>Other</option>
          </select>
        </label>
      </div>

      <label class="field">
        <span>Notes (optional)</span>
        <textarea id="txNotes" name="notes" rows="3" maxlength="500"
          placeholder="Add a note to remember the details…"></textarea>
      </label>

      <div class="form-actions">
        <button type="submit" class="btn btn-primary" id="saveTransactionBtn">Save transaction</button>
        <button type="button" class="btn btn-quiet" data-action="cancel-edit">Clear</button>
      </div>
      <p class="form-footnote">Your entries are stored locally in this browser.</p>`;

    view.appendChild(form);
  }

  function updateTypeButtons() {
    $$(".type-choice").forEach(button => {
      button.classList.toggle("active", button.dataset.type === activeType);
    });

    updateText("formHeading", editingId
      ? "Edit transaction"
      : activeType === "income" ? "Record income" : "Record expense");

    updateText("saveTransactionBtn", editingId ? "Save changes" : "Save transaction");

    const category = $("#txCategory");
    if (category) {
      const previous = category.value;
      const choices = CATEGORIES[activeType];

      category.innerHTML = choices.map(item =>
        `<option value="${escapeHTML(item)}">${escapeHTML(item)}</option>`
      ).join("");

      if (choices.includes(previous)) category.value = previous;
    }
  }

  function renderAddForm(transaction = null) {
    ensureAddForm();
    const form = $("#transactionForm");
    if (!form) return;

    form.hidden = false;

    const amount = $("#txAmount");
    const description = $("#txDescription");
    const date = $("#txDate");
    const category = $("#txCategory");
    const payment = $("#txPayment");
    const notes = $("#txNotes");

    if (!transaction && !editingId) {
      form.reset();
      if (amount) amount.value = "";
      if (description) description.value = "";
      if (date) date.value = today();
      if (notes) notes.value = "";
      if (payment) payment.value = "Bank";
    } else if (transaction) {
      if (amount) amount.value = transaction.amount;
      if (description) description.value = transaction.description;
      if (date) date.value = transaction.date;
      if (payment) payment.value = transaction.payment;
      if (notes) notes.value = transaction.notes;
    }

    if (category) {
      const wanted = transaction?.category;
      category.innerHTML = CATEGORIES[activeType].map(item =>
        `<option value="${escapeHTML(item)}">${escapeHTML(item)}</option>`
      ).join("");

      if (wanted && !CATEGORIES[activeType].includes(wanted)) {
        category.add(new Option(wanted, wanted));
      }
      if (wanted) category.value = wanted;
    }

    updateTypeButtons();

    if (transaction) {
      updateText("formHeading", "Edit transaction");
      updateText("saveTransactionBtn", "Save changes");
    }

    form.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => amount?.focus({ preventScroll: true }), 120);
  }

  function clearAddForm() {
    editingId = null;
    activeType = "expense";
    const form = $("#transactionForm");
    if (form) form.reset();

    if ($("#txDate")) $("#txDate").value = today();
    if ($("#txPayment")) $("#txPayment").value = "Bank";

    updateTypeButtons();
    updateText("formHeading", "Record expense");
    updateText("saveTransactionBtn", "Save transaction");
  }

  function saveTransaction(event) {
    event.preventDefault();

    const amount = Number($("#txAmount")?.value);
    const description = $("#txDescription")?.value.trim();
    const date = $("#txDate")?.value;
    const category = $("#txCategory")?.value;
    const payment = $("#txPayment")?.value || "Other";
    const notes = $("#txNotes")?.value.trim() || "";

    if (!Number.isFinite(amount) || amount <= 0) {
      toast("Enter an amount greater than zero.");
      $("#txAmount")?.focus();
      return;
    }

    if (!description) {
      toast("Enter a description for this transaction.");
      $("#txDescription")?.focus();
      return;
    }

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      toast("Choose a valid transaction date.");
      return;
    }

    if (!category) {
      toast("Choose a category.");
      return;
    }

    const existing = editingId
      ? transactions.find(tx => tx.id === editingId)
      : null;

    const record = {
      id: existing?.id || makeId(),
      type: activeType,
      amount: Math.round(amount * 100) / 100,
      description,
      category,
      date,
      payment,
      notes,
      createdAt: existing?.createdAt || Date.now()
    };

    const previous = transactions;

    if (editingId) {
      transactions = transactions.map(tx => tx.id === editingId ? record : tx);
    } else {
      transactions.push(record);
    }

    if (!persistTransactions()) {
      transactions = previous;
      return;
    }

    clearAddForm();
    renderAll();
    toast(existing ? "Transaction updated." : "Transaction saved.");
    showView("home");
  }

  /* ---------------- Analysis screen ---------------- */

  function renderAnalysis() {
    settings.period = settings.period === "month" ? "month" : "week";
    settings.reportDate = /^\d{4}-\d{2}-\d{2}$/.test(settings.reportDate || "")
      ? settings.reportDate
      : today();

    const dateInput = $("#reportDate");
    if (dateInput) dateInput.value = settings.reportDate;

    $$("[data-period]").forEach(button => {
      const active = button.dataset.period === settings.period;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    const current = periodTransactions();
    const income = sumType(current, "income");
    const expense = sumType(current, "expense");
    const { start, end } = getPeriodBounds();

    updateText("flowTitle", settings.period === "month"
      ? fmtMonth(settings.reportDate)
      : `${fmtDate(start)} – ${fmtDate(end)}`);

    updateText("flowFoot", `Income ${money(income)} · Expenses ${money(expense)} · Net ${money(income - expense)}`);
    updateText("donutTotal", shortMoney(expense));

    drawFlowChart(current);
    drawCategoryChart(current);
    renderBudgets();
    renderInsights(current);
    renderTransactions();
  }

  function drawEmptyCanvas(canvas, message) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const width = Math.max(260, rect.width || 320);
    const height = Math.max(170, rect.height || 220);
    const ratio = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = width * ratio;
    canvas.height = height * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#91a39c";
    ctx.font = "13px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(message, width / 2, height / 2);
  }

  function canvasSize(canvas, minHeight = 190) {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(260, rect.width || 320);
    const height = Math.max(minHeight, rect.height || minHeight);
    const ratio = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);

    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return { ctx, width, height };
  }

  function drawFlowChart(list) {
    const canvas = $("#flowChart");
    if (!canvas) return;

    if (!list.length) {
      drawEmptyCanvas(canvas, "Add transactions to see your cash flow");
      return;
    }

    const { ctx, width, height } = canvasSize(canvas, 210);
    const { start, end } = getPeriodBounds();
    const first = new Date(`${start}T12:00:00`);
    const last = new Date(`${end}T12:00:00`);
    const dayCount = Math.round((last - first) / 86400000) + 1;

    const points = [];

    for (let i = 0; i < dayCount; i++) {
      const date = new Date(first);
      date.setDate(first.getDate() + i);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      const dayTransactions = list.filter(tx => tx.date === key);

      points.push({
        key,
        label: settings.period === "month"
          ? String(date.getDate())
          : date.toLocaleDateString("en-IN", { weekday: "short" }),
        income: sumType(dayTransactions, "income"),
        expense: sumType(dayTransactions, "expense")
      });
    }

    const maxValue = Math.max(1, ...points.flatMap(p => [p.income, p.expense]));
    const left = 42, right = 12, top = 18, bottom = 32;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const base = top + plotHeight;

    ctx.font = "10px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";

    for (let i = 0; i <= 4; i++) {
      const y = top + (plotHeight * i) / 4;
      const value = maxValue * (1 - i / 4);
      ctx.strokeStyle = "#34443e";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(width - right, y);
      ctx.stroke();

      ctx.fillStyle = "#94a59e";
      ctx.fillText(shortMoney(value), left - 7, y);
    }

    const slot = plotWidth / points.length;
    const barWidth = Math.max(3, Math.min(15, slot * 0.29));

    points.forEach((point, i) => {
      const center = left + slot * i + slot / 2;
      const incomeHeight = point.income / maxValue * plotHeight;
      const expenseHeight = point.expense / maxValue * plotHeight;

      ctx.fillStyle = "#b7f28b";
      ctx.beginPath();
      ctx.roundRect(center - barWidth - 2, base - incomeHeight, barWidth, Math.max(1, incomeHeight), 3);
      ctx.fill();

      ctx.fillStyle = "#ff9c91";
      ctx.beginPath();
      ctx.roundRect(center + 2, base - expenseHeight, barWidth, Math.max(1, expenseHeight), 3);
      ctx.fill();

      const showLabel = settings.period !== "month" ||
        i === 0 || i === points.length - 1 || i % 5 === 0;

      if (showLabel) {
        ctx.fillStyle = "#94a59e";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(point.label, center, base + 8);
      }
    });
  }

  function drawCategoryChart(list) {
    const canvas = $("#categoryChart");
    if (!canvas) return;

    const totals = {};
    list.filter(tx => tx.type === "expense").forEach(tx => {
      totals[tx.category] = (totals[tx.category] || 0) + tx.amount;
    });

    const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((sum, item) => sum + item[1], 0);

    updateText("donutTotal", shortMoney(total));

    if (!entries.length) {
      drawEmptyCanvas(canvas, "No spending recorded yet");
      setHTML("categoryLegend", '<p class="muted">Your category breakdown will appear here.</p>');
      return;
    }

    const { ctx, width, height } = canvasSize(canvas, 190);
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.max(35, Math.min(width, height) * 0.35);
    let angle = -Math.PI / 2;

    entries.forEach(([category, amount], index) => {
      const slice = amount / total * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, angle, angle + slice);
      ctx.closePath();
      ctx.fillStyle = COLORS[index % COLORS.length];
      ctx.fill();
      angle += slice;
    });

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * 0.64, 0, Math.PI * 2);
    ctx.fillStyle = getComputedStyle(canvas).backgroundColor || "#1d2a27";
    ctx.fill();

    setHTML("categoryLegend", entries.slice(0, 7).map(([category, amount], index) => `
      <div class="category-legend-row">
        <span class="legend-dot" style="background:${COLORS[index % COLORS.length]}"></span>
        <span class="legend-name">${escapeHTML(category)}</span>
        <strong>${Math.round(amount / total * 100)}%</strong>
      </div>`).join("") + (entries.length > 7
        ? `<p class="muted">And ${entries.length - 7} more categories</p>`
        : ""));
  }

  function renderBudgets() {
    const target = $("#budgetList");
    if (!target) return;

    const month = monthTransactions();
    const spending = {};

    month.filter(tx => tx.type === "expense").forEach(tx => {
      spending[tx.category] = (spending[tx.category] || 0) + tx.amount;
    });

    const categoryNames = [...new Set([
      ...Object.keys(budgets),
      ...Object.keys(spending)
    ])];

    if (!categoryNames.length) {
      target.innerHTML = '<p class="muted">No category activity yet. Add expenses or set a budget.</p>';
      return;
    }

    target.innerHTML = categoryNames
      .filter(category => (Number(budgets[category]) || 0) > 0 || (spending[category] || 0) > 0)
      .sort((a, b) => (spending[b] || 0) - (spending[a] || 0))
      .map(category => {
        const spent = spending[category] || 0;
        const limit = Number(budgets[category]) || 0;
        const percentage = limit > 0 ? spent / limit * 100 : 0;
        const barWidth = Math.min(100, percentage);
        const color = percentage > 100 ? "#ff9c91" : "#62d3e4";

        return `
          <div class="budget-row">
            <div class="budget-label">
              <span>${escapeHTML(category)}</span>
              <strong>${money(spent)}${limit > 0 ? ` / ${money(limit)}` : ""}</strong>
            </div>
            <div class="budget-track">
              <div class="budget-fill" style="width:${barWidth}%;background:${color}"></div>
            </div>
            <small class="muted">${limit > 0
              ? percentage.toFixed(0) + "% of budget"
              : "No budget set"}</small>
          </div>`;
      }).join("");
  }

  function renderInsights(list) {
    const target = $("#insights");
    if (!target) return;

    const income = sumType(list, "income");
    const expense = sumType(list, "expense");
    const net = income - expense;

    const expenses = {};
    list.filter(tx => tx.type === "expense").forEach(tx => {
      expenses[tx.category] = (expenses[tx.category] || 0) + tx.amount;
    });

    const highest = Object.entries(expenses).sort((a, b) => b[1] - a[1])[0];
    const expenseCount = list.filter(tx => tx.type === "expense").length;
    const average = expenseCount ? expense / expenseCount : 0;
    const savingsRate = income > 0 ? net / income * 100 : null;

    const items = [
      {
        title: "Net cash flow",
        value: money(net),
        description: net >= 0 ? "Your income exceeds your spending." : "Your expenses exceed your income."
      },
      {
        title: "Top spending category",
        value: highest ? highest[0] : "No spending yet",
        description: highest ? `${money(highest[1])} spent in this category.` : "Record an expense to discover your largest category."
      },
      {
        title: "Average expense",
        value: money(average),
        description: `${expenseCount} expense${expenseCount === 1 ? "" : "s"} in this report period.`
      },
      {
        title: "Savings rate",
        value: savingsRate === null ? "—" : `${savingsRate.toFixed(1)}%`,
        description: income > 0 ? "Calculated from income minus expenses." : "Add income to calculate your savings rate."
      }
    ];

    target.innerHTML = items.map(item => `
      <div class="insight-row">
        <span class="insight-mark">✦</span>
        <div><small>${escapeHTML(item.title)}</small>
          <strong>${escapeHTML(item.value)}</strong>
          <p>${escapeHTML(item.description)}</p>
        </div>
      </div>`).join("");
  }

  /* ---------------- Transaction list ---------------- */

  function renderTransactions() {
    const tbody = $("#transactionRows");
    if (!tbody) return;

    const search = ($("#searchInput")?.value || "").trim().toLowerCase();
    const type = $("#typeFilter")?.value || "all";
    const category = $("#categoryFilter")?.value || "all";

    const filtered = [...transactions]
      .filter(tx => type === "all" || tx.type === type)
      .filter(tx => category === "all" || tx.category === category)
      .filter(tx => !search || `${tx.description} ${tx.category} ${tx.notes} ${tx.payment}`.toLowerCase().includes(search))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);

    tbody.innerHTML = filtered.map(tx => `
      <tr>
        <td>${fmtDate(tx.date)}</td>
        <td>
          <strong>${escapeHTML(tx.description)}</strong>
          ${tx.notes ? `<small class="table-note">${escapeHTML(tx.notes)}</small>` : ""}
        </td>
        <td>${escapeHTML(tx.category)}</td>
        <td><span class="type-pill ${tx.type}">${tx.type === "income" ? "Income" : "Expense"}</span></td>
        <td class="right ${tx.type === "income" ? "positive" : "negative"}">
          ${tx.type === "income" ? "+" : "−"}${money(tx.amount)}
        </td>
        <td class="row-actions">
          <button type="button" class="btn btn-small btn-quiet" data-action="edit" data-id="${escapeHTML(tx.id)}">Edit</button>
          <button type="button" class="btn btn-small btn-quiet" data-action="delete" data-id="${escapeHTML(tx.id)}" aria-label="Delete ${escapeHTML(tx.description)}">Delete</button>
        </td>
      </tr>`).join("");

    const empty = $("#emptyState");
    if (empty) empty.hidden = filtered.length > 0;

    updateText("transactionCaption", `${filtered.length} transaction${filtered.length === 1 ? "" : "s"}`);
    populateCategoryFilter();
  }

  function populateCategoryFilter() {
    const select = $("#categoryFilter");
    if (!select) return;

    const previous = select.value || "all";
    const categories = [...new Set(transactions.map(tx => tx.category))].sort();

    select.innerHTML = '<option value="all">All categories</option>' +
      categories.map(category =>
        `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`
      ).join("");

    if (categories.includes(previous)) select.value = previous;
  }

  function editTransaction(id) {
    const tx = transactions.find(item => item.id === id);
    if (!tx) return toast("Transaction not found.");

    openAdd(tx.type, tx);
  }

  function deleteTransaction(id) {
    const tx = transactions.find(item => item.id === id);
    if (!tx) return;

    if (!confirm(`Delete "${tx.description}" (${money(tx.amount)})? This cannot be undone unless you have a backup.`)) return;

    const previous = transactions;
    transactions = transactions.filter(item => item.id !== id);

    if (!persistTransactions()) {
      transactions = previous;
      return;
    }

    renderAll();
    toast("Transaction deleted.");
  }

  /* ---------------- Budgets ---------------- */

  function editBudgets() {
    const month = monthTransactions();
    const spent = {};

    month.filter(tx => tx.type === "expense").forEach(tx => {
      spent[tx.category] = (spent[tx.category] || 0) + tx.amount;
    });

    const categories = [...new Set([
      ...CATEGORIES.expense,
      ...Object.keys(budgets),
      ...Object.keys(spent)
    ])];

    const choice = prompt(
      "Enter the exact expense category to set a budget for:\n\n" +
      categories.join(", ")
    );

    if (!choice) return;

    const category = categories.find(item => item.toLowerCase() === choice.trim().toLowerCase());
    if (!category) {
      toast("Category not recognised.");
      return;
    }

    const raw = prompt(
      `Monthly budget for ${category} in ₹.\nEnter 0 to remove the budget.`,
      String(budgets[category] || "")
    );

    if (raw === null) return;

    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      toast("Enter a valid budget amount.");
      return;
    }

    const previous = { ...budgets };

    if (value === 0) delete budgets[category];
    else budgets[category] = Math.round(value * 100) / 100;

    if (!persistBudgets()) {
      budgets = previous;
      return;
    }

    renderBudgets();
    toast(value === 0 ? "Budget removed." : "Monthly budget saved.");
  }

  /* ---------------- Backup and restore ---------------- */

  function exportBackup() {
    const backup = {
      app: "ZenSpend",
      version: 2,
      exportedAt: new Date().toISOString(),
      transactions,
      budgets,
      settings
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `zenspend-backup-${today()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast("Backup exported. Keep the file private.");
  }

  function importBackup(file) {
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || ""));
        if (!data || !Array.isArray(data.transactions)) {
          throw new Error("This file does not contain a valid ZenSpend transaction list.");
        }

        const imported = data.transactions.map(tx => {
          const amount = Number(tx.amount);
          if (!Number.isFinite(amount) || amount <= 0) {
            throw new Error("A transaction has an invalid amount.");
          }
          if (!["income", "expense"].includes(tx.type)) {
            throw new Error("A transaction has an invalid type.");
          }

          return {
            id: String(tx.id || makeId()),
            type: tx.type,
            amount: Math.round(amount * 100) / 100,
            description: String(tx.description || "Imported transaction"),
            category: String(tx.category || "Other Expense"),
            date: /^\d{4}-\d{2}-\d{2}$/.test(tx.date || "") ? tx.date : today(),
            payment: String(tx.payment || "Other"),
            notes: String(tx.notes || ""),
            createdAt: Number(tx.createdAt) || Date.now()
          };
        });

        const replace = confirm(
          "Press OK to REPLACE your current transactions with this backup.\n\nPress Cancel to MERGE the backup into your current transactions."
        );

        const oldTransactions = transactions;
        const oldBudgets = budgets;

        if (replace) {
          transactions = imported;
        } else {
          const byId = new Map(transactions.map(tx => [tx.id, tx]));
          imported.forEach(tx => byId.set(tx.id, tx));
          transactions = [...byId.values()];
        }

        if (data.budgets && typeof data.budgets === "object" && !Array.isArray(data.budgets)) {
          budgets = { ...budgets, ...data.budgets };
        }

        if (!persistTransactions() || !persistBudgets()) {
          transactions = oldTransactions;
          budgets = oldBudgets;
          return;
        }

        renderAll();
        toast("Backup imported successfully.");
      } catch (error) {
        alert(`Could not import backup: ${error.message}`);
      }
    };

    reader.onerror = () => alert("Could not read that backup file.");
    reader.readAsText(file);
  }

  /* ---------------- Events ---------------- */

  function bindEvents() {
    document.addEventListener("click", event => {
      const nav = event.target.closest("[data-view]");
      if (nav && nav.classList.contains("nav-item")) {
        showView(nav.dataset.view);
        return;
      }

      const periodButton = event.target.closest("[data-period]");
      if (periodButton) {
        settings.period = periodButton.dataset.period === "month" ? "month" : "week";
        persistSettings();
        renderAnalysis();
        renderHome();
        return;
      }

      const typeButton = event.target.closest(".type-choice");
      if (typeButton) {
        activeType = typeButton.dataset.type === "income" ? "income" : "expense";
        updateTypeButtons();
        return;
      }

      const actionButton = event.target.closest("[data-action]");
      if (actionButton) {
        const { action, id } = actionButton.dataset;

        if (action === "add") openAdd("expense");
        if (action === "edit") editTransaction(id);
        if (action === "delete") deleteTransaction(id);
        if (action === "cancel-edit") clearAddForm();
        if (action === "export") exportBackup();
        if (action === "import") $("#importFile")?.click();

        return;
      }

      const goButton = event.target.closest("[data-go]");
      if (goButton) {
        showView(goButton.dataset.go);
        return;
      }

      if (event.target.closest("#homeAddBtn, #analysisAddBtn, #emptyAddBtn")) {
        openAdd("expense");
        return;
      }

      if (event.target.closest("#addExpenseBtn")) {
        openAdd("expense");
        return;
      }

      if (event.target.closest("#addIncomeBtn")) {
        openAdd("income");
        return;
      }

      if (event.target.closest("#budgetBtn")) {
        editBudgets();
      }
    });

    const form = $("#transactionForm");
    form?.addEventListener("submit", saveTransaction);

    $("#reportDate")?.addEventListener("change", event => {
      settings.reportDate = event.target.value || today();
      persistSettings();
      renderAnalysis();
      renderHome();
    });

    ["searchInput", "typeFilter", "categoryFilter"].forEach(id => {
      document.getElementById(id)?.addEventListener(
        id === "searchInput" ? "input" : "change",
        renderTransactions
      );
    });

    $("#exportBtn")?.addEventListener("click", exportBackup);
    $("#importBtn")?.addEventListener("click", () => $("#importFile")?.click());

    $("#importFile")?.addEventListener("change", event => {
      importBackup(event.target.files?.[0]);
      event.target.value = "";
    });

    $("#clearAllBtn")?.addEventListener("click", () => {
      if (!confirm("Delete ALL transactions and budgets from this browser? Export a backup first if you need one.")) return;

      const oldTransactions = transactions;
      const oldBudgets = budgets;
      transactions = [];
      budgets = {};

      if (!persistTransactions() || !persistBudgets()) {
        transactions = oldTransactions;
        budgets = oldBudgets;
        return;
      }

      renderAll();
      toast("All transactions and budgets cleared.");
    });

    window.addEventListener("resize", debounce(() => {
      if (currentView === "analysis") renderAnalysis();
    }, 160));
  }

  function debounce(fn, wait) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  /* ---------------- Render and initialise ---------------- */

  function renderAll() {
    renderHome();
    renderAddOverview();
    if (currentView === "analysis") renderAnalysis();
  }

  function init() {
    // Create the Add form if it is not already present.
    ensureAddForm();

    if ($("#reportDate")) {
      $("#reportDate").value = settings.reportDate || today();
    }

    // These buttons are generated by this script.
    bindEvents();

    renderAll();
    showView("home");
  }

  return {
    init,
    showView,
    openAdd,
    renderAll,
    exportBackup,
    importBackup,
    getTransactions: () => transactions.map(tx => ({ ...tx }))
  };
})();

document.addEventListener("DOMContentLoaded", () => {
  ZenSpend.init();
});
