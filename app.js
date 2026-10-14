
"use strict";

const $ = (id) => document.getElementById(id);

const EXPENSE_CATEGORIES = [
  "Food & Dining", "Transport", "Shopping", "Bills & Utilities",
  "Rent & Housing", "Health", "Entertainment", "Education",
  "Travel", "EMI & Debt", "Family", "Personal Care", "Other"
];
const INCOME_CATEGORIES = [
  "Salary", "Freelance", "Business", "Refund", "Investment",
  "Gift", "Other Income"
];
const COLORS = [
  "#b7f28b", "#80c9ff", "#f2a18e", "#c4a5ff", "#f5d477",
  "#72ddd0", "#f19ac6", "#a7b4c4", "#e5a76c", "#9ecca0",
  "#c6c5f6", "#d2ad92", "#b4d6df"
];
const DB_NAME = "zenspend-local-v1";
const STORE_NAME = "transactions";
const LEGACY_KEY = "zenspend-transactions-v1";
const BUDGET_KEY = "zenspend-budgets-v1";

let db;
let transactions = [];
let budgets = {};
let period = "week";
let toastTimer;
let resizeTimer;

const today = () => localDate(new Date());
function localDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}
function parseDate(s) {
  const [y,m,d] = s.split("-").map(Number);
  return new Date(y, m-1, d);
}
function money(n) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 2
  }).format(Number(n) || 0);
}
function safeNumber(n) {
  return Number.isFinite(Number(n)) ? Number(n) : 0;
}
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  })[c]);
}
function showToast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 2500);
}
function setOptions(select, items, firstLabel) {
  select.innerHTML = "";
  if (firstLabel) {
    const opt = document.createElement("option");
    opt.value = "all";
    opt.textContent = firstLabel;
    select.append(opt);
  }
  items.forEach(value => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = value;
    select.append(opt);
  });
}
function categoriesFor(type) {
  return type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}
function updateCategoryOptions(selected) {
  const type = document.querySelector('input[name="txType"]:checked').value;
  const categories = categoriesFor(type);
  setOptions($("category"), categories);
  if (selected && categories.includes(selected)) $("category").value = selected;
}
function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("date", "date", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function readAll() {
  return requestPromise(db.transaction(STORE_NAME, "readonly")
    .objectStore(STORE_NAME).getAll());
}
async function putTransaction(tx) {
  await requestPromise(db.transaction(STORE_NAME, "readwrite")
    .objectStore(STORE_NAME).put(tx));
}
async function deleteTransaction(id) {
  await requestPromise(db.transaction(STORE_NAME, "readwrite")
    .objectStore(STORE_NAME).delete(id));
}
async function migrateLegacyData() {
  const old = localStorage.getItem(LEGACY_KEY);
  if (!old) return;
  try {
    const parsed = JSON.parse(old);
    if (Array.isArray(parsed)) {
      for (const tx of parsed) {
        if (tx && tx.id && tx.date && tx.type &&
            Number.isFinite(Number(tx.amount))) {
          await putTransaction(tx);
        }
      }
    }
    localStorage.removeItem(LEGACY_KEY);
  } catch (error) {
    console.warn("Could not migrate old local records.", error);
  }
}
function loadBudgets() {
  try {
    const value = JSON.parse(localStorage.getItem(BUDGET_KEY) || "{}");
    budgets = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    budgets = {};
  }
}
function selectedDate() {
  return parseDate($("reportDate").value || today());
}
function getPeriodBounds() {
  const date = selectedDate();
  let start, end;
  if (period === "week") {
    const weekday = (date.getDay() + 6) % 7;
    start = new Date(date.getFullYear(), date.getMonth(), date.getDate() - weekday);
    end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  } else {
    start = new Date(date.getFullYear(), date.getMonth(), 1);
    end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  }
  return { start: localDate(start), end: localDate(end) };
}
function periodTransactions() {
  const { start, end } = getPeriodBounds();
  return transactions.filter(tx => tx.date >= start && tx.date <= end);
}
function sumType(list, type) {
  return list.reduce((sum, tx) => sum + (tx.type === type ? safeNumber(tx.amount) : 0), 0);
}
function periodName() {
  const d = selectedDate();
  return period === "week"
    ? `Week of ${d.toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" })}`
    : d.toLocaleDateString("en-IN", { month:"long", year:"numeric" });
}
function fmtDate(date) {
  return parseDate(date).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" });
}
function updateSummary(list) {
  const income = sumType(list, "income");
  const expense = sumType(list, "expense");
  const net = income - expense;
  const rate = income > 0 ? net / income * 100 : null;
  $("incomeTotal").textContent = money(income);
  $("expenseTotal").textContent = money(expense);
  $("netTotal").textContent = money(net);
  $("netTotal").style.color = net < 0 ? "var(--red)" : "var(--green)";
  $("savingsRate").textContent = rate === null ? "—" : `${rate.toFixed(1)}%`;
  $("incomeCaption").textContent = `${list.filter(t => t.type === "income").length} income entries`;
  $("expenseCaption").textContent = `${list.filter(t => t.type === "expense").length} expense entries`;
  $("netCaption").textContent = net < 0 ? "Spending exceeded income" : "Income minus expenses";
  $("flowTitle").textContent = periodName();
  $("transactionCaption").textContent = `${list.length} transaction${list.length === 1 ? "" : "s"} in this period`;
  $("todayLabel").textContent = new Date().toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  }).toUpperCase();
}
function chartCanvas(id) {
  const canvas = $(id);
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(200, rect.width);
  const height = Math.max(150, rect.height);
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height };
}
function drawFlowChart(list) {
  const { ctx, width: w, height: h } = chartCanvas("flowChart");
  const { start, end } = getPeriodBounds();
  const first = parseDate(start);
  const last = parseDate(end);
  const days = Math.round((last - first) / 86400000) + 1;
  const count = period === "week" ? days : days;
  const data = Array.from({length: count}, (_, i) => {
    const d = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i);
    const key = localDate(d);
    const rows = list.filter(tx => tx.date === key);
    return {
      label: period === "week"
        ? d.toLocaleDateString("en-IN", {weekday:"short"})
        : String(d.getDate()),
      income: sumType(rows, "income"),
      expense: sumType(rows, "expense")
    };
  });
  const max = Math.max(1, ...data.map(d => Math.max(d.income, d.expense)));
  const pad = { left: 8, right: 8, top: 16, bottom: 25 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;
  const step = plotW / data.length;
  const groupW = Math.min(25, step * .62);
  const barW = Math.max(2, (groupW - 4) / 2);

  ctx.font = "10px system-ui";
  ctx.textAlign = "center";
  for (let i = 0; i < 4; i++) {
    const y = pad.top + plotH * i / 3;
    ctx.strokeStyle = "#2b3a2e";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w-pad.right,y); ctx.stroke();
  }
  data.forEach((d, i) => {
    const x = pad.left + i * step + step / 2;
    const incH = d.income / max * plotH;
    const expH = d.expense / max * plotH;
    ctx.fillStyle = "#b7f28b";
    ctx.beginPath();
    ctx.roundRect(x-groupW/2, pad.top+plotH-incH, barW, Math.max(incH, d.income ? 2 : 0), 3);
    ctx.fill();
    ctx.fillStyle = "#f2a18e";
    ctx.beginPath();
    ctx.roundRect(x-groupW/2+barW+4, pad.top+plotH-expH, barW, Math.max(expH, d.expense ? 2 : 0), 3);
    ctx.fill();
    if (period === "week" || i % 3 === 0 || i === data.length - 1) {
      ctx.fillStyle = "#98a89a";
      ctx.fillText(d.label, x, h - 7);
    }
  });
  const income = sumType(list, "income");
  const expense = sumType(list, "expense");
  $("flowFoot").textContent = `${money(income)} earned · ${money(expense)} spent`;
}
function drawCategoryChart(list) {
  const expenses = list.filter(tx => tx.type === "expense");
  const grouped = {};
  expenses.forEach(tx => grouped[tx.category] = (grouped[tx.category] || 0) + safeNumber(tx.amount));
  const items = Object.entries(grouped).sort((a,b) => b[1]-a[1]);
  const total = items.reduce((sum, item) => sum + item[1], 0);
  $("donutTotal").textContent = money(total);
  const { ctx, width:w, height:h } = chartCanvas("categoryChart");
  const cx = w/2, cy = h/2, radius = Math.min(w,h)*.43;
  let angle = -Math.PI/2;
  if (total <= 0) {
    ctx.beginPath(); ctx.arc(cx,cy,radius,0,Math.PI*2);
    ctx.strokeStyle = "#2b3a2e"; ctx.lineWidth = 17; ctx.stroke();
  } else {
    items.forEach(([name,value], i) => {
      const slice = value / total * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx,cy,radius,angle,angle+slice);
      ctx.strokeStyle = COLORS[i % COLORS.length];
      ctx.lineWidth = 17;
      ctx.lineCap = "butt";
      ctx.stroke();
      angle += slice;
    });
  }
  $("categoryLegend").innerHTML = items.length ? items.slice(0,8).map(([name,value],i) =>
    `<div class="legend-row">
      <span class="legend-swatch" style="background:${COLORS[i%COLORS.length]}"></span>
      <span class="legend-name">${escapeHTML(name)}</span>
      <span class="legend-value">${total ? (value/total*100).toFixed(0) : 0}%</span>
    </div>`).join("") : '<p class="muted">No expenses in this period.</p>';
}
function monthExpenses(date) {
  const y = date.getFullYear(), m = date.getMonth();
  return transactions.filter(tx => {
    const d = parseDate(tx.date);
    return tx.type === "expense" && d.getFullYear() === y && d.getMonth() === m;
  });
}
function renderBudgets() {
  const spent = {};
  monthExpenses(selectedDate()).forEach(tx => {
    spent[tx.category] = (spent[tx.category] || 0) + safeNumber(tx.amount);
  });
  const active = EXPENSE_CATEGORIES.filter(c => safeNumber(budgets[c]) > 0);
  if (!active.length) {
    $("budgetList").innerHTML = '<p class="muted small-sub">No budgets set yet. Add monthly limits to keep your spending on track.</p>';
    return;
  }
  $("budgetList").innerHTML = active.map((category,i) => {
    const limit = safeNumber(budgets[category]);
    const amount = spent[category] || 0;
    const pct = limit ? amount/limit*100 : 0;
    return `<div>
      <div class="budget-item-head"><strong>${escapeHTML(category)}</strong>
        <span>${money(amount)} / ${money(limit)}</span></div>
      <div class="progress"><span class="${pct>100?"over":""}" style="width:${Math.min(100,pct)}%;background:${pct>100?"var(--red)":COLORS[i%COLORS.length]}"></span></div>
      <p class="description-sub">${pct>100 ? `${money(amount-limit)} over budget` : `${Math.max(0,100-pct).toFixed(0)}% remaining`}</p>
    </div>`;
  }).join("");
}
function renderInsights(list) {
  const income = sumType(list,"income");
  const expense = sumType(list,"expense");
  const net = income-expense;
  const grouped = {};
  list.filter(tx=>tx.type==="expense").forEach(tx=>{
    grouped[tx.category]=(grouped[tx.category]||0)+safeNumber(tx.amount);
  });
  const biggest = Object.entries(grouped).sort((a,b)=>b[1]-a[1])[0];
  const activeBudgets = EXPENSE_CATEGORIES.filter(c=>safeNumber(budgets[c])>0);
  const over = activeBudgets.filter(c=>(grouped[c]||0)>safeNumber(budgets[c]));
  const tips = [
    {icon:"↗",title:net>=0?"Positive cash flow":"Negative cash flow",
      text:net>=0?`You are ahead by ${money(net)} in this period.`:`You spent ${money(-net)} more than you earned in this period.`},
    {icon:"◉",title:biggest?"Largest spending category":"Start tracking spending",
      text:biggest?`${biggest[0]} accounts for ${money(biggest[1])} of your expenses.`:"Add expense entries to discover where your money goes."}
  ];
  if (over.length) tips.push({icon:"!",title:"Budget attention",text:`Over budget: ${over.join(", ")}.`});
  else if (activeBudgets.length) tips.push({icon:"✓",title:"Budget check",text:"No set category budget is exceeded in this report."});
  else tips.push({icon:"✦",title:"Build a habit",text:"Set category budgets to give your spending a clear plan."});
  if (income>0) tips.push({icon:"%",title:"Savings rate",text:`${(net/income*100).toFixed(1)}% of recorded income remains after expenses.`});
  $("insights").innerHTML = tips.map(t=>`<div class="insight">
    <span class="insight-icon">${t.icon}</span><div><strong>${escapeHTML(t.title)}</strong><p>${escapeHTML(t.text)}</p></div>
  </div>`).join("");
}
function renderTransactions(list);renderHomeRecent(); {
  const query = $("searchInput").value.trim().toLowerCase();
  const type = $("typeFilter").value;
  const category = $("categoryFilter").value;
  const rows = list.filter(tx => {
    const matchText = `${tx.description} ${tx.category} ${tx.notes||""}`.toLowerCase().includes(query);
    return matchText && (type==="all"||tx.type===type) && (category==="all"||tx.category===category);
  }).sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt-a.createdAt);
  $("transactionRows").innerHTML = rows.map(tx => `<tr>
    <td>${fmtDate(tx.date)}</td>
    <td><div class="description-main">${escapeHTML(tx.description)}</div>
      <div class="description-sub">${escapeHTML(tx.payment||"")}${tx.notes?` · ${escapeHTML(tx.notes)}`:""}</div></td>
    <td>${escapeHTML(tx.category)}</td>
    <td><span class="type-pill ${tx.type}">${tx.type==="income"?"Income":"Expense"}</span></td>
    <td class="right amount ${tx.type}">${tx.type==="income"?"+":"−"}${money(tx.amount)}</td>
    <td><div class="row-actions">
      <button data-edit="${escapeHTML(tx.id)}" aria-label="Edit transaction">Edit</button>
      <button data-delete="${escapeHTML(tx.id)}" aria-label="Delete transaction">Delete</button>
    </div></td>
  </tr>`).join("");
  $("emptyState").style.display = rows.length ? "none" : "block";
  $("transactionRows").closest("table").style.display = rows.length ? "table" : "none";
}
function render() {
  const list = periodTransactions();
  updateSummary(list);
  drawFlowChart(list);
  drawCategoryChart(list);
  renderBudgets();
  renderInsights(list);
  renderTransactions(list);
  document.querySelectorAll(".tab").forEach(tab => {
    const active = tab.dataset.period === period;
    tab.classList.toggle("active",active);
    tab.setAttribute("aria-pressed",String(active));
  });
}
function resetForm() {
  $("transactionForm").reset();
  $("transactionId").value = "";
  $("txDate").value = today();
  $("formError").textContent = "";
  $("dialogTitle").textContent = "Add transaction";
  $("saveBtn").textContent = "Save transaction";
  updateCategoryOptions();
}
function openAddDialog() {
  resetForm();
  $("transactionDialog").showModal();
}
function openEditDialog(id) {
  const tx = transactions.find(item => item.id === id);
  if (!tx) return;
  resetForm();
  $("transactionId").value = tx.id;
  document.querySelector(`input[name="txType"][value="${tx.type}"]`).checked = true;
  updateCategoryOptions(tx.category);
  $("amount").value = tx.amount;
  $("txDate").value = tx.date;
  $("description").value = tx.description;
  $("category").value = tx.category;
  $("payment").value = tx.payment || "Other";
  $("notes").value = tx.notes || "";
  $("dialogTitle").textContent = "Edit transaction";
  $("saveBtn").textContent = "Save changes";
  $("transactionDialog").showModal();
}
async function saveTransaction(event) {
  event.preventDefault();
  const amount = Number($("amount").value);
  const description = $("description").value.trim();
  const date = $("txDate").value;
  const type = document.querySelector('input[name="txType"]:checked').value;
  const category = $("category").value;
  if (!Number.isFinite(amount) || amount <= 0 || !description || !date || !category) {
    $("formError").textContent = "Enter a valid amount, description, date and category.";
    return;
  }
  if (date > "9999-12-31") {
    $("formError").textContent = "Please choose a valid date.";
    return;
  }
  const id = $("transactionId").value || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
  const existing = transactions.find(tx => tx.id === id);
  const tx = {
    id, type, amount: Math.round(amount*100)/100, description, date, category,
    payment: $("payment").value, notes: $("notes").value.trim(),
    createdAt: existing ? existing.createdAt : Date.now(),
    updatedAt: Date.now()
  };
  try {
    await putTransaction(tx);
    await refreshTransactions();
    $("transactionDialog").close();
    render();
    showToast(existing ? "Transaction updated" : "Transaction saved");
  } catch (error) {
    console.error(error);
    $("formError").textContent = "Could not save. Check browser storage availability.";
  }
}
async function refreshTransactions() {
  transactions = (await readAll()).filter(tx =>
    tx && typeof tx.id === "string" && ["income","expense"].includes(tx.type) &&
    Number.isFinite(Number(tx.amount)) && tx.date && typeof tx.description === "string"
  );
}
async function removeTransaction(id) {
  const tx = transactions.find(item=>item.id===id);
  if (!tx || !confirm(`Delete "${tx.description}" (${money(tx.amount)})? This cannot be undone unless you have a backup.`)) return;
  try {
    await deleteTransaction(id);
    await refreshTransactions();
    render();
    showToast("Transaction deleted");
  } catch (error) {
    console.error(error);
    showToast("Could not delete transaction");
  }
}
function openBudgetDialog() {
  $("budgetFields").innerHTML = EXPENSE_CATEGORIES.map(category=>`
    <label class="budget-field">${escapeHTML(category)}
      <input type="number" min="0" step="0.01" data-budget="${escapeHTML(category)}"
        value="${safeNumber(budgets[category])||""}" placeholder="No limit">
    </label>`).join("");
  $("budgetDialog").showModal();
}
function saveBudgets(event) {
  event.preventDefault();
  const next = {};
  $("budgetFields").querySelectorAll("[data-budget]").forEach(input => {
    const amount = Number(input.value);
    if (input.value.trim() && Number.isFinite(amount) && amount > 0) {
      next[input.dataset.budget] = Math.round(amount*100)/100;
    }
  });
  budgets = next;
  localStorage.setItem(BUDGET_KEY,JSON.stringify(budgets));
  $("budgetDialog").close();
  render();
  showToast("Budgets saved on this device");
}
function exportBackup() {
  const payload = {
    app: "ZenSpend",
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    transactions,
    budgets
  };
  const blob = new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `zenspend-backup-${today()}.json`;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  showToast("Backup exported — keep it private");
}
async function importBackup(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    if (!payload || payload.app !== "ZenSpend" || !Array.isArray(payload.transactions)) {
      throw new Error("This does not look like a ZenSpend backup.");
    }
    const valid = payload.transactions.filter(tx =>
      tx && typeof tx.id === "string" && ["income","expense"].includes(tx.type) &&
      Number.isFinite(Number(tx.amount)) && Number(tx.amount)>0 &&
      typeof tx.description === "string" && /^\d{4}-\d{2}-\d{2}$/.test(tx.date) &&
      typeof tx.category === "string" && tx.description.length<=100
    );
    if (valid.length !== payload.transactions.length) {
      throw new Error("Some backup records are invalid. Nothing was imported.");
    }
    if (!confirm(`Import ${valid.length} transactions? Existing records with matching IDs will be replaced. Other records will be kept.`)) return;
    for (const tx of valid) {
      await putTransaction({
        id:tx.id, type:tx.type, amount:Number(tx.amount), description:tx.description,
        date:tx.date, category:tx.category, payment:String(tx.payment||"Other"),
        notes:String(tx.notes||""), createdAt:Number(tx.createdAt)||Date.now(),
        updatedAt:Date.now()
      });
    }
    if (payload.budgets && typeof payload.budgets === "object" && !Array.isArray(payload.budgets)) {
      const next = {};
      EXPENSE_CATEGORIES.forEach(c => {
        const value = Number(payload.budgets[c]);
        if (Number.isFinite(value) && value > 0) next[c] = value;
      });
      budgets = next;
      localStorage.setItem(BUDGET_KEY,JSON.stringify(budgets));
    }
    await refreshTransactions();
    render();
    showToast(`Imported ${valid.length} transactions`);
  } catch (error) {
    console.error(error);
    alert(`Import failed: ${error.message || "Invalid backup file"}`);
  } finally {
    $("importFile").value = "";
  }
}
function wireEvents() {
  wireMainNavigation();
  ["addBtn","addTopBtn","emptyAddBtn"].forEach(id => $(id).addEventListener("click",openAddDialog));
  document.querySelectorAll("[data-close]").forEach(button => {
    button.addEventListener("click",()=>$(button.dataset.close).close());
  });
  $("transactionForm").addEventListener("submit",saveTransaction);
  $("budgetBtn").addEventListener("click",openBudgetDialog);
  $("budgetForm").addEventListener("submit",saveBudgets);
  document.querySelectorAll('input[name="txType"]').forEach(radio =>
    radio.addEventListener("change",()=>updateCategoryOptions()));
  document.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click",()=>{
    period = tab.dataset.period;
    render();
  }));
  $("reportDate").addEventListener("change",render);
  ["searchInput","typeFilter","categoryFilter"].forEach(id =>
    $(id).addEventListener(id==="searchInput"?"input":"change",()=>renderTransactions(periodTransactions())));
  $("transactionRows").addEventListener("click",event=>{
    const edit = event.target.closest("[data-edit]");
    const del = event.target.closest("[data-delete]");
    if (edit) openEditDialog(edit.dataset.edit);
    if (del) removeTransaction(del.dataset.delete);
  });
  $("exportBtn").addEventListener("click",exportBackup);
  $("importBtn").addEventListener("click",()=>$("importFile").click());
  $("importFile").addEventListener("change",event=>importBackup(event.target.files[0]));
  window.addEventListener("resize",()=>{
    clearTimeout(resizeTimer);
    resizeTimer=setTimeout(render,120);
  });
  [ $("transactionDialog"), $("budgetDialog") ].forEach(dialog => {
    dialog.addEventListener("click",event=>{
      if (event.target===dialog) dialog.close();
    });
  });
}

function showView(name) {
  document.querySelectorAll(".app-view").forEach(view => {
    view.classList.toggle("active", view.id === `${name}-view`);
  });

  document.querySelectorAll(".nav-item").forEach(button => {
    const active = button.dataset.view === name;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });

  if (name === "home") renderHomeRecent();
  if (name === "analysis") {
    requestAnimationFrame(() => {
      drawFlowChart(periodTransactions());
      drawCategoryChart(periodTransactions());
    });
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderHomeRecent() {
  const list = [...transactions]
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 5);

  const target = document.getElementById("homeRecent");
  if (!target) return;

  target.innerHTML = list.length ? list.map(tx => `
    <div class="home-recent-row">
      <span class="recent-symbol">${tx.type === "income" ? "↙" : "↗"}</span>
      <span class="recent-description">
        <strong>${escapeHTML(tx.description)}</strong>
        <small>${escapeHTML(tx.category)} · ${fmtDate(tx.date)}</small>
      </span>
      <span class="recent-amount ${tx.type}">
        ${tx.type === "income" ? "+" : "−"}${money(tx.amount)}
      </span>
    </div>
  `).join("") : '<p class="muted">No transactions yet. Add your first income or expense.</p>';

  const current = periodTransactions();
  const income = sumType(current, "income");
  const expense = sumType(current, "expense");
  document.getElementById("addIncomeTotal").textContent = money(income);
  document.getElementById("addExpenseTotal").textContent = money(expense);
}

function wireMainNavigation() {
  document.querySelectorAll(".nav-item").forEach(button => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });

  document.querySelectorAll("[data-go]").forEach(button => {
    button.addEventListener("click", () => showView(button.dataset.go));
  });

  document.getElementById("homeAddBtn").addEventListener("click", () => showView("add"));
  document.getElementById("analysisAddBtn").addEventListener("click", () => showView("add"));

  document.getElementById("addExpenseBtn").addEventListener("click", () => {
    resetForm();
    document.querySelector('input[name="txType"][value="expense"]').checked = true;
    updateCategoryOptions();
    document.getElementById("transactionDialog").showModal();
  });

  document.getElementById("addIncomeBtn").addEventListener("click", () => {
    resetForm();
    document.querySelector('input[name="txType"][value="income"]').checked = true;
    updateCategoryOptions();
    document.getElementById("transactionDialog").showModal();
  });
}
async function init() {
  $("reportDate").value = today();
  setOptions($("categoryFilter"),[...new Set([...EXPENSE_CATEGORIES,...INCOME_CATEGORIES])],"All categories");
  updateCategoryOptions();
  loadBudgets();
  wireEvents();
  try {
    if (!("indexedDB" in window)) throw new Error("IndexedDB unavailable");
    db = await openDatabase();
    await migrateLegacyData();
    await refreshTransactions();
    render();
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("./sw.js").catch(err=>console.warn("Offline cache unavailable",err));
    }
  } catch (error) {
    console.error(error);
    alert("ZenSpend could not open local storage. Please use an up-to-date browser and ensure site storage is allowed.");
  }
}
init();
