const STORAGE_KEY = "liquid_glass_todo_v1";
const TOKEN_KEY = "todolist_token_v1";
const FILTER_KEY = "todolist_filter_v1";

/** 后端可用时由 boot() 置为 true（同源 /api/health） */
let apiMode = false;
let authToken = null;
let currentUsername = "";

function nowIso() {
  return new Date().toISOString();
}

function formatTime(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatMonthDay(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}

function formatDateTimeShort(iso) {
  return `${formatMonthDay(iso)} ${formatTime(iso)}`;
}

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function parseDateTimeLocal(value) {
  const v = String(value || "").trim();
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function toDateTimeLocalValue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function loadFilter() {
  try {
    const f = localStorage.getItem(FILTER_KEY);
    return ["all", "active", "done"].includes(f) ? f : "all";
  } catch {
    return "all";
  }
}

function saveFilterOnly() {
  try {
    localStorage.setItem(FILTER_KEY, state.filter);
  } catch (_) {}
}

function loadLegacyState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { items: [], filter: loadFilter() };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { items: [], filter: loadFilter() };
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    const filter = ["all", "active", "done"].includes(parsed.filter) ? parsed.filter : loadFilter();
    return { items, filter };
  } catch {
    return { items: [], filter: loadFilter() };
  }
}

function persistState() {
  if (useServer()) {
    saveFilterOnly();
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    saveFilterOnly();
  } catch (_) {}
}

function useServer() {
  return !!(apiMode && authToken);
}

function logout() {
  authToken = null;
  currentUsername = "";
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch (_) {}
  state.items = [];
  if (els.userRow) els.userRow.hidden = true;
  if (apiMode) {
    if (els.mainShell) els.mainShell.hidden = true;
    if (els.authScreen) els.authScreen.hidden = false;
  }
}

async function api(method, path, body) {
  const opts = { method, headers: {} };
  if (authToken) opts.headers.Authorization = `Bearer ${authToken}`;
  if (body !== undefined && method !== "GET" && method !== "DELETE") {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(path, opts);
  const text = await r.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { _raw: text };
  }
  if (r.status === 401) {
    logout();
    throw new Error(typeof data.error === "string" ? data.error : "登录已失效");
  }
  if (!r.ok) throw new Error(typeof data.error === "string" ? data.error : text || String(r.status));
  return data;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function confettiPulse(el) {
  el.animate(
    [
      { transform: "translateY(0px) scale(1)", filter: "saturate(1)" },
      { transform: "translateY(-1px) scale(1.01)", filter: "saturate(1.2)" },
      { transform: "translateY(0px) scale(1)", filter: "saturate(1)" },
    ],
    { duration: 420, easing: "cubic-bezier(.2,1,.2,1)" }
  );
}

const els = {
  form: document.getElementById("form"),
  title: document.getElementById("title"),
  remindAt: document.getElementById("remindAt"),
  dueAt: document.getElementById("dueAt"),
  list: document.getElementById("list"),
  empty: document.getElementById("empty"),
  emptyTitle: document.getElementById("emptyTitle"),
  emptySub: document.getElementById("emptySub"),
  stats: document.getElementById("stats"),
  clearDone: document.getElementById("clearDone"),
  seed: document.getElementById("seed"),
  filterBtns: Array.from(document.querySelectorAll("[data-filter]")),
  toastHost: document.getElementById("toastHost"),
  editSheet: document.getElementById("editSheet"),
  editTitleInput: document.getElementById("editTitleInput"),
  editRemindAt: document.getElementById("editRemindAt"),
  editDueAt: document.getElementById("editDueAt"),
  editSave: document.getElementById("editSave"),
  dtp: document.getElementById("dtp"),
  dtpTitle: document.getElementById("dtpTitle"),
  dtpClear: document.getElementById("dtpClear"),
  dtpPrev: document.getElementById("dtpPrev"),
  dtpNext: document.getElementById("dtpNext"),
  dtpMonth: document.getElementById("dtpMonth"),
  dtpDays: document.getElementById("dtpDays"),
  dtpHour: document.getElementById("dtpHour"),
  dtpMin: document.getElementById("dtpMin"),
  dtpNow: document.getElementById("dtpNow"),
  dtpOk: document.getElementById("dtpOk"),
  authScreen: document.getElementById("authScreen"),
  mainShell: document.getElementById("mainShell"),
  loginForm: document.getElementById("loginForm"),
  registerForm: document.getElementById("registerForm"),
  authErr: document.getElementById("authErr"),
  loginUser: document.getElementById("loginUser"),
  loginPass: document.getElementById("loginPass"),
  regUser: document.getElementById("regUser"),
  regPass: document.getElementById("regPass"),
  showRegister: document.getElementById("showRegister"),
  showLogin: document.getElementById("showLogin"),
  logoutBtn: document.getElementById("logoutBtn"),
  userRow: document.getElementById("userRow"),
  displayUser: document.getElementById("displayUser"),
  footLine: document.getElementById("footLine"),
};

let state = { items: [], filter: loadFilter() };
let lastToggledIndex = null;
const reminderTimers = new Map(); // id -> timeout
let editingId = null;
/** @type {{ item: object, index: number, timer: ReturnType<typeof setTimeout> } | null} */
let deleteUndo = null;

function syncBodyScroll() {
  const locked = !els.dtp?.hidden || !els.editSheet?.hidden;
  document.body.style.overflow = locked ? "hidden" : "";
}

function migrateItems() {
  let changed = false;
  for (const it of state.items) {
    if (it && typeof it === "object") {
      if (!("remindAt" in it)) {
        it.remindAt = null;
        changed = true;
      }
      if (!("dueAt" in it)) {
        it.dueAt = null;
        changed = true;
      }
      if (!("remindedAt" in it)) {
        it.remindedAt = null;
        changed = true;
      }
    }
  }
  if (changed) persistState();
}

function visibleItems() {
  if (state.filter === "active") return state.items.filter((x) => !x.done);
  if (state.filter === "done") return state.items.filter((x) => x.done);
  return state.items;
}

function updateStats() {
  const total = state.items.length;
  const done = state.items.filter((x) => x.done).length;
  const left = total - done;
  const label = total === 0 ? "准备开始？" : `${left} 进行中 · ${done} 已完成 · 共 ${total}`;
  els.stats.textContent = label;
}

function setFilter(next) {
  state.filter = next;
  for (const b of els.filterBtns) {
    const on = b.dataset.filter === next;
    b.setAttribute("aria-selected", on ? "true" : "false");
  }
  persistState();
  render();
}

function render() {
  const items = visibleItems();
  els.list.innerHTML = "";

  // 空态：只要当前筛选下没有可见项，就展示空态卡片
  els.empty.hidden = items.length !== 0;
  updateEmptyCopy(items.length === 0);
  updateStats();

  for (const it of items) {
    els.list.appendChild(renderItem(it));
  }
}

function updateEmptyCopy(isEmptyVisible) {
  if (!isEmptyVisible || !els.emptyTitle || !els.emptySub) return;
  if (state.items.length === 0) {
    els.emptyTitle.textContent = "现在很干净";
    els.emptySub.textContent = "加一条任务，或者点「生成示例」。";
    return;
  }
  if (state.filter === "active") {
    els.emptyTitle.textContent = "没有进行中的任务";
    els.emptySub.textContent = "可以切到「全部」看看，或新建一条。";
  } else if (state.filter === "done") {
    els.emptyTitle.textContent = "还没有已完成的任务";
    els.emptySub.textContent = "去完成几条，或切换筛选。";
  } else {
    els.emptyTitle.textContent = "现在很干净";
    els.emptySub.textContent = "加一条任务，或者点「生成示例」。";
  }
}

function renderItem(it) {
  const li = document.createElement("li");
  const overdue = isOverdue(it);
  li.className = `item ${it.done ? "done" : ""} ${overdue ? "overdue" : ""} itemEnter`;
  li.dataset.id = it.id;

  const check = document.createElement("button");
  check.className = "check";
  check.type = "button";
  check.setAttribute("aria-label", it.done ? "标记为未完成" : "标记为已完成");

  const text = document.createElement("div");
  text.className = "text";

  const title = document.createElement("div");
  title.className = "titleLine";
  title.textContent = it.title;

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = `${it.done ? "完成" : "创建"} · ${formatTime(it.createdAt)}`;

  const pillRow = document.createElement("div");
  pillRow.className = "pillRow";

  if (it.remindAt) {
    const p = document.createElement("span");
    p.className = "pill remind";
    p.textContent = `提醒 ${formatDateTimeShort(it.remindAt)}`;
    pillRow.appendChild(p);
  }
  if (it.dueAt) {
    const p = document.createElement("span");
    p.className = `pill ${overdue && !it.done ? "warn" : ""}`.trim();
    p.textContent = `截止 ${formatDateTimeShort(it.dueAt)}`;
    pillRow.appendChild(p);
  }

  text.appendChild(title);
  text.appendChild(meta);
  if (pillRow.childElementCount) text.appendChild(pillRow);

  const editBtn = document.createElement("button");
  editBtn.className = "iconBtn";
  editBtn.type = "button";
  editBtn.setAttribute("aria-label", "编辑");
  editBtn.innerHTML =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20h4l9.5-9.5a2.121 2.121 0 0 0-3-3L5 17v3zm12.5-11.5l2 2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const del = document.createElement("button");
  del.className = "iconBtn danger";
  del.type = "button";
  del.setAttribute("aria-label", "删除");
  del.innerHTML =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 3h6m-9 4h12m-10 0 1 14h8l1-14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  check.addEventListener("click", (e) => {
    const shift = e.shiftKey;
    void toggleDone(it.id, { shift });
    confettiPulse(li);
  });

  editBtn.addEventListener("click", () => openEdit(it.id));

  del.addEventListener("click", () => removeItem(it.id, li));

  li.appendChild(check);
  li.appendChild(text);
  li.appendChild(editBtn);
  li.appendChild(del);
  return li;
}

async function addItem(title) {
  const trimmed = title.trim();
  if (!trimmed) return;
  const remindAt = parseDateTimeLocal(els.remindAt?.value);
  const dueAt = parseDateTimeLocal(els.dueAt?.value);
  const item = {
    id: uid(),
    title: trimmed,
    done: false,
    createdAt: nowIso(),
    remindAt,
    dueAt,
    remindedAt: null,
  };
  if (useServer()) {
    try {
      const created = await api("POST", "/api/todos", item);
      state.items.unshift(created);
      persistState();
      scheduleReminders();
      render();
    } catch (e) {
      showToast({ title: "保存失败", sub: e.message });
    }
    return;
  }
  state.items.unshift(item);
  persistState();
  scheduleReminders();
  render();
}

function findIndexById(id) {
  return state.items.findIndex((x) => x.id === id);
}

async function toggleDone(id, { shift }) {
  const idx = findIndexById(id);
  if (idx < 0) return;

  const next = !state.items[idx].done;

  if (useServer()) {
    try {
      if (shift && lastToggledIndex != null) {
        const a = clamp(lastToggledIndex, 0, state.items.length - 1);
        const b = clamp(idx, 0, state.items.length - 1);
        const from = Math.min(a, b);
        const to = Math.max(a, b);
        for (let i = from; i <= to; i++) {
          const it = state.items[i];
          await api("PATCH", `/api/todos/${encodeURIComponent(it.id)}`, { done: next });
          state.items[i].done = next;
        }
      } else {
        await api("PATCH", `/api/todos/${encodeURIComponent(id)}`, { done: next });
        state.items[idx].done = next;
      }
      lastToggledIndex = idx;
      persistState();
      scheduleReminders();
      render();
    } catch (e) {
      showToast({ title: "同步失败", sub: e.message });
    }
    return;
  }

  if (shift && lastToggledIndex != null) {
    const a = clamp(lastToggledIndex, 0, state.items.length - 1);
    const b = clamp(idx, 0, state.items.length - 1);
    const from = Math.min(a, b);
    const to = Math.max(a, b);
    for (let i = from; i <= to; i++) state.items[i].done = next;
  } else {
    state.items[idx].done = next;
  }

  lastToggledIndex = idx;
  persistState();
  scheduleReminders();
  render();
}

function removeItem(id, liEl) {
  const idx = findIndexById(id);
  if (idx < 0) return;

  const snapshot = JSON.parse(JSON.stringify(state.items[idx]));

  if (liEl) {
    liEl.classList.remove("itemEnter");
    liEl.classList.add("itemExit");
    liEl.addEventListener(
      "animationend",
      () => {
        void (async () => {
          const i = findIndexById(id);
          if (i < 0) return;
          if (useServer()) {
            try {
              await api("DELETE", `/api/todos/${encodeURIComponent(id)}`);
              state.items.splice(i, 1);
              persistState();
              scheduleReminders();
              offerDeleteUndo(snapshot, i);
              render();
            } catch (e) {
              showToast({ title: "删除失败", sub: e.message });
              render();
            }
            return;
          }
          state.items.splice(i, 1);
          persistState();
          scheduleReminders();
          offerDeleteUndo(snapshot, i);
          render();
        })();
      },
      { once: true }
    );
  } else if (useServer()) {
    void (async () => {
      try {
        await api("DELETE", `/api/todos/${encodeURIComponent(id)}`);
        state.items.splice(idx, 1);
        persistState();
        scheduleReminders();
        offerDeleteUndo(snapshot, idx);
        render();
      } catch (e) {
        showToast({ title: "删除失败", sub: e.message });
      }
    })();
  } else {
    state.items.splice(idx, 1);
    persistState();
    scheduleReminders();
    offerDeleteUndo(snapshot, idx);
    render();
  }
}

function clearDeleteUndo() {
  if (deleteUndo?.timer) clearTimeout(deleteUndo.timer);
  deleteUndo = null;
}

function offerDeleteUndo(item, index) {
  clearDeleteUndo();
  deleteUndo = { item, index, timer: null };
  const el = showUndoToast(item.title, () => {
    undoDelete();
    if (el.isConnected) el.remove();
  });
  deleteUndo.timer = setTimeout(() => {
    clearDeleteUndo();
    if (el.isConnected) el.remove();
  }, 8000);
}

async function undoDelete() {
  if (!deleteUndo) return;
  const { item, index } = deleteUndo;
  clearDeleteUndo();
  const i = Math.min(Math.max(0, index), state.items.length);
  if (useServer()) {
    try {
      const created = await api("POST", "/api/todos", item);
      state.items.splice(i, 0, created);
      persistState();
      scheduleReminders();
      render();
    } catch (e) {
      showToast({ title: "撤销失败", sub: e.message });
    }
    return;
  }
  state.items.splice(i, 0, item);
  persistState();
  scheduleReminders();
  render();
}

function openEdit(id) {
  const it = state.items.find((x) => x.id === id);
  if (!it || !els.editSheet) return;
  editingId = id;
  els.editTitleInput.value = it.title;
  els.editRemindAt.value = toDateTimeLocalValue(it.remindAt) || "";
  els.editDueAt.value = toDateTimeLocalValue(it.dueAt) || "";
  els.editSheet.hidden = false;
  syncBodyScroll();
  setTimeout(() => els.editTitleInput?.focus(), 0);
}

function closeEdit() {
  editingId = null;
  if (els.editSheet) els.editSheet.hidden = true;
  syncBodyScroll();
}

async function saveEdit() {
  if (!editingId) return;
  const idx = findIndexById(editingId);
  if (idx < 0) {
    closeEdit();
    return;
  }
  const title = String(els.editTitleInput?.value || "").trim();
  if (!title) return;
  const prevRemind = state.items[idx].remindAt;
  const remindAt = parseDateTimeLocal(els.editRemindAt?.value);
  const dueAt = parseDateTimeLocal(els.editDueAt?.value);
  const patch = { title, remindAt, dueAt };
  if (prevRemind !== remindAt) patch.remindedAt = null;
  if (useServer()) {
    try {
      const updated = await api("PATCH", `/api/todos/${encodeURIComponent(editingId)}`, patch);
      state.items[idx] = updated;
      persistState();
      scheduleReminders();
      closeEdit();
      render();
    } catch (e) {
      showToast({ title: "保存失败", sub: e.message });
    }
    return;
  }
  state.items[idx].title = title;
  state.items[idx].remindAt = remindAt;
  state.items[idx].dueAt = dueAt;
  if (prevRemind !== remindAt) state.items[idx].remindedAt = null;
  persistState();
  scheduleReminders();
  closeEdit();
  render();
}

async function clearDone() {
  const hadDone = state.items.some((x) => x.done);
  if (!hadDone) return;
  if (useServer()) {
    try {
      await api("POST", "/api/todos/clear-done", {});
      state.items = state.items.filter((x) => !x.done);
      persistState();
      scheduleReminders();
      render();
    } catch (e) {
      showToast({ title: "操作失败", sub: e.message });
    }
    return;
  }
  state.items = state.items.filter((x) => !x.done);
  persistState();
  scheduleReminders();
  render();
}

async function seed() {
  const base = [
    "把一个小问题先做完（不求完美）",
    "回两封邮件，别积压",
    "把明天要做的三件事写下来",
    "散步 15 分钟，给大脑降噪",
    "整理桌面/桌面文件夹 5 分钟",
  ];
  if (useServer()) {
    try {
      for (let i = base.length - 1; i >= 0; i--) {
        const item = {
          id: uid(),
          title: base[i],
          done: !!(i % 4 === 0),
          createdAt: nowIso(),
          remindAt: i === 1 ? new Date(Date.now() + 90 * 1000).toISOString() : null,
          dueAt: i === 2 ? new Date(Date.now() + 20 * 60 * 1000).toISOString() : null,
          remindedAt: null,
        };
        const created = await api("POST", "/api/todos", item);
        state.items.unshift(created);
      }
      persistState();
      scheduleReminders();
      render();
    } catch (e) {
      showToast({ title: "生成失败", sub: e.message });
    }
    return;
  }
  for (let i = base.length - 1; i >= 0; i--) {
    state.items.unshift({
      id: uid(),
      title: base[i],
      done: i % 4 === 0,
      createdAt: nowIso(),
      remindAt: i === 1 ? new Date(Date.now() + 90 * 1000).toISOString() : null,
      dueAt: i === 2 ? new Date(Date.now() + 20 * 60 * 1000).toISOString() : null,
      remindedAt: null,
    });
  }
  persistState();
  scheduleReminders();
  render();
}

function focusSearch() {
  els.title.focus();
  els.title.select();
}

els.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  await addItem(els.title.value);
  els.title.value = "";
  if (els.remindAt) els.remindAt.value = "";
  if (els.dueAt) els.dueAt.value = "";
  els.title.focus();
});

els.clearDone.addEventListener("click", () => void clearDone());

els.seed.addEventListener("click", () => void seed());

for (const b of els.filterBtns) {
  b.addEventListener("click", () => setFilter(b.dataset.filter));
}

window.addEventListener("keydown", (e) => {
  const meta = e.metaKey || e.ctrlKey;

  if (meta && e.key.toLowerCase() === "k") {
    e.preventDefault();
    focusSearch();
  }

  if (meta && e.key === "Backspace") {
    e.preventDefault();
    void clearDone();
  }
});

async function apiPublic(method, path, payload) {
  const r = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await r.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!r.ok) throw new Error(typeof data.error === "string" ? data.error : text || String(r.status));
  return data;
}

function showAuthErr(msg) {
  if (!els.authErr) return;
  els.authErr.textContent = msg;
  els.authErr.hidden = !msg;
}

/** @param {"login" | "register"} pane */
function setAuthPane(pane) {
  const login = pane === "login";
  if (els.loginForm) els.loginForm.hidden = !login;
  if (els.registerForm) els.registerForm.hidden = login;
  if (els.showRegister) els.showRegister.hidden = !login;
  if (els.showLogin) els.showLogin.hidden = login;
  showAuthErr("");
}

async function onAuthSuccess(res) {
  authToken = res.token;
  currentUsername = res.username || "";
  try {
    localStorage.setItem(TOKEN_KEY, authToken);
  } catch (_) {}
  const todos = await api("GET", "/api/todos");
  state.items = Array.isArray(todos) ? todos : [];
  state.filter = loadFilter();
  migrateItems();
  afterLoginInit();
}

let uiWired = false;
function ensureUiWired() {
  if (uiWired) return;
  uiWired = true;
  initDtp();
  initEdit();
}

function afterLoginInit() {
  hydrateComposer();
  for (const b of els.filterBtns) {
    const on = b.dataset.filter === state.filter;
    b.setAttribute("aria-selected", on ? "true" : "false");
  }
  saveFilterOnly();
  scheduleReminders();
  if (els.mainShell) els.mainShell.hidden = false;
  if (els.authScreen) els.authScreen.hidden = true;
  if (els.userRow) els.userRow.hidden = false;
  if (els.displayUser) els.displayUser.textContent = currentUsername || "用户";
  if (els.footLine) {
    els.footLine.textContent = "已登录：数据在服务器 SQLite（data/todolist.db）；换设备请用同一账号登录。";
  }
  showAuthErr("");
  ensureUiWired();
  bindLogoutOnce();
  render();
}

function initLocalApp() {
  state = loadLegacyState();
  migrateItems();
  hydrateComposer();
  setFilter(state.filter);
  scheduleReminders();
  if (els.authScreen) els.authScreen.hidden = true;
  if (els.mainShell) els.mainShell.hidden = false;
  if (els.userRow) els.userRow.hidden = true;
  if (els.footLine) {
    els.footLine.textContent =
      "本地模式：数据在浏览器 localStorage；使用 npm start 打开本站并登录可改为云端账号数据。";
  }
  ensureUiWired();
  render();
}

let authFormsBound = false;
function bindAuthForms() {
  if (authFormsBound) return;
  authFormsBound = true;

  els.loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    showAuthErr("");
    try {
      const res = await apiPublic("POST", "/api/auth/login", {
        username: els.loginUser?.value?.trim(),
        password: els.loginPass?.value || "",
      });
      await onAuthSuccess(res);
    } catch (err) {
      showAuthErr(err.message || "登录失败");
    }
  });

  els.registerForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    showAuthErr("");
    try {
      const res = await apiPublic("POST", "/api/auth/register", {
        username: els.regUser?.value?.trim(),
        password: els.regPass?.value || "",
      });
      await onAuthSuccess(res);
    } catch (err) {
      showAuthErr(err.message || "注册失败");
    }
  });

  els.showRegister?.addEventListener("click", () => setAuthPane("register"));

  els.showLogin?.addEventListener("click", () => setAuthPane("login"));
}

let logoutBound = false;
function bindLogoutOnce() {
  if (logoutBound) return;
  logoutBound = true;
  els.logoutBtn?.addEventListener("click", () => {
    logout();
    if (els.authScreen) els.authScreen.hidden = false;
    if (els.mainShell) els.mainShell.hidden = true;
    if (els.loginPass) els.loginPass.value = "";
    if (els.regPass) els.regPass.value = "";
    setAuthPane("login");
  });
}

async function boot() {
  try {
    const r = await fetch("/api/health", { cache: "no-store" });
    apiMode = r.ok;
  } catch {
    apiMode = false;
  }

  if (!apiMode) {
    initLocalApp();
    return;
  }

  authToken = localStorage.getItem(TOKEN_KEY);
  if (!authToken) {
    if (els.mainShell) els.mainShell.hidden = true;
    if (els.authScreen) els.authScreen.hidden = false;
    bindAuthForms();
    return;
  }

  try {
    const todos = await api("GET", "/api/todos");
    state.items = Array.isArray(todos) ? todos : [];
    state.filter = loadFilter();
    migrateItems();
    afterLoginInit();
  } catch {
    logout();
    if (els.mainShell) els.mainShell.hidden = true;
    if (els.authScreen) els.authScreen.hidden = false;
    bindAuthForms();
  }
}

void boot();

function hydrateComposer() {
  // 让刷新后输入框不莫名带旧值（浏览器自动填充有时会）
  if (els.remindAt) els.remindAt.value = "";
  if (els.dueAt) els.dueAt.value = "";
}

// 自定义 24 小时制日期时间选择器（保证不出现 AM/PM）
const dtpState = {
  openFor: null, // HTMLInputElement
  year: 0,
  month: 0, // 0-11
  day: 1, // 1-31
};

function pad2(n) {
  return String(n).padStart(2, "0");
}

function openDtp(input, label) {
  if (!els.dtp) return;
  dtpState.openFor = input;
  if (els.dtpTitle) els.dtpTitle.textContent = label;

  const base = input.value ? new Date(input.value) : new Date();
  const d = Number.isNaN(base.getTime()) ? new Date() : base;

  dtpState.year = d.getFullYear();
  dtpState.month = d.getMonth();
  dtpState.day = d.getDate();

  fillTime(d);
  renderCalendar();

  els.dtp.hidden = false;
  syncBodyScroll();
}

function closeDtp() {
  if (!els.dtp) return;
  els.dtp.hidden = true;
  dtpState.openFor = null;
  syncBodyScroll();
}

function fillTime(d) {
  if (!els.dtpHour || !els.dtpMin) return;
  els.dtpHour.value = pad2(d.getHours());
  els.dtpMin.value = pad2(d.getMinutes());
}

function getSelectedDate() {
  const h = Number(els.dtpHour?.value ?? "0");
  const m = Number(els.dtpMin?.value ?? "0");
  return new Date(dtpState.year, dtpState.month, dtpState.day, h, m, 0, 0);
}

function applySelected() {
  const input = dtpState.openFor;
  if (!input) return;
  const d = getSelectedDate();
  const value = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(
    d.getHours()
  )}:${pad2(d.getMinutes())}`;
  input.value = value;
  closeDtp();
}

function clearSelected() {
  const input = dtpState.openFor;
  if (!input) return;
  input.value = "";
  closeDtp();
}

function monthLabel(y, m) {
  return `${y}-${pad2(m + 1)}`;
}

function renderCalendar() {
  if (!els.dtpMonth || !els.dtpDays) return;
  els.dtpMonth.textContent = monthLabel(dtpState.year, dtpState.month);

  const y = dtpState.year;
  const m = dtpState.month;

  const first = new Date(y, m, 1);
  const startDow = (first.getDay() + 6) % 7; // Monday=0
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const prevDays = new Date(y, m, 0).getDate();

  const cells = [];
  for (let i = 0; i < startDow; i++) {
    cells.push({ day: prevDays - (startDow - 1 - i), muted: true, offset: -1 });
  }
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, muted: false, offset: 0 });

  // 填充下个月日期到 6 行
  let nextDay = 1;
  while (cells.length < 42) {
    cells.push({ day: nextDay++, muted: true, offset: +1 });
  }

  const today = new Date();
  const todayY = today.getFullYear();
  const todayM = today.getMonth();
  const todayD = today.getDate();

  els.dtpDays.innerHTML = "";
  for (const c of cells) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `dtpDay${c.muted ? " muted" : ""}`;
    btn.textContent = String(c.day);

    let cellY = y;
    let cellM = m;
    if (c.offset === -1) {
      const p = new Date(y, m - 1, 1);
      cellY = p.getFullYear();
      cellM = p.getMonth();
    } else if (c.offset === +1) {
      const n = new Date(y, m + 1, 1);
      cellY = n.getFullYear();
      cellM = n.getMonth();
    }

    const isSel = c.offset === 0 && c.day === dtpState.day;
    if (isSel) btn.classList.add("sel");
    if (cellY === todayY && cellM === todayM && c.day === todayD && (c.offset === 0 || c.muted))
      btn.classList.add("today");

    btn.addEventListener("click", () => {
      if (c.offset === -1) {
        dtpState.month -= 1;
        if (dtpState.month < 0) {
          dtpState.month = 11;
          dtpState.year -= 1;
        }
      } else if (c.offset === +1) {
        dtpState.month += 1;
        if (dtpState.month > 11) {
          dtpState.month = 0;
          dtpState.year += 1;
        }
      }
      dtpState.day = c.day;
      renderCalendar();
    });

    els.dtpDays.appendChild(btn);
  }
}

function initDtp() {
  if (!els.dtp) return;

  if (els.dtpHour && els.dtpHour.childElementCount === 0) {
    for (let h = 0; h < 24; h++) {
      const o = document.createElement("option");
      o.value = pad2(h);
      o.textContent = pad2(h);
      els.dtpHour.appendChild(o);
    }
  }
  if (els.dtpMin && els.dtpMin.childElementCount === 0) {
    for (let m = 0; m < 60; m++) {
      const o = document.createElement("option");
      o.value = pad2(m);
      o.textContent = pad2(m);
      els.dtpMin.appendChild(o);
    }
  }

  els.dtp.addEventListener("click", (e) => {
    const t = e.target;
    if (t && t.getAttribute && t.getAttribute("data-dtp-close") === "1") closeDtp();
  });

  els.dtpPrev?.addEventListener("click", () => {
    dtpState.month -= 1;
    if (dtpState.month < 0) {
      dtpState.month = 11;
      dtpState.year -= 1;
    }
    renderCalendar();
  });

  els.dtpNext?.addEventListener("click", () => {
    dtpState.month += 1;
    if (dtpState.month > 11) {
      dtpState.month = 0;
      dtpState.year += 1;
    }
    renderCalendar();
  });

  els.dtpNow?.addEventListener("click", () => {
    const d = new Date();
    dtpState.year = d.getFullYear();
    dtpState.month = d.getMonth();
    dtpState.day = d.getDate();
    fillTime(d);
    renderCalendar();
  });

  els.dtpOk?.addEventListener("click", () => applySelected());
  els.dtpClear?.addEventListener("click", () => clearSelected());

  for (const [input, label] of [
    [els.remindAt, "提醒时间"],
    [els.dueAt, "截止时间"],
    [els.editRemindAt, "提醒时间"],
    [els.editDueAt, "截止时间"],
  ]) {
    if (!input) continue;
    const wrap = input.closest?.("label");
    wrap?.addEventListener("click", (e) => {
      e.preventDefault();
      openDtp(input, label);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openDtp(input, label);
      }
    });
  }

  window.addEventListener("keydown", (e) => {
    if (els.dtp?.hidden) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeDtp();
    }
    if (e.key === "Enter") {
      e.preventDefault();
      applySelected();
    }
  });
}

function initEdit() {
  els.editSheet?.addEventListener("click", (e) => {
    const t = e.target;
    if (t && t.getAttribute && t.getAttribute("data-edit-close") === "1") closeEdit();
  });

  els.editSave?.addEventListener("click", () => void saveEdit());

  window.addEventListener("keydown", (e) => {
    if (els.dtp && !els.dtp.hidden) return;
    if (!els.editSheet || els.editSheet.hidden) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeEdit();
    }
    if (e.key === "Enter" && e.target === els.editTitleInput) {
      e.preventDefault();
      void saveEdit();
    }
  });
}

function isOverdue(it) {
  if (!it?.dueAt) return false;
  if (it?.done) return false;
  const t = new Date(it.dueAt).getTime();
  if (Number.isNaN(t)) return false;
  return t < Date.now();
}

function showToast({ title, sub }) {
  const host = els.toastHost;
  if (!host) return;

  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `
    <div>
      <div class="toastTitle"></div>
      <div class="toastSub"></div>
    </div>
    <button class="toastX" type="button" aria-label="关闭">✕</button>
  `;
  el.querySelector(".toastTitle").textContent = title;
  el.querySelector(".toastSub").textContent = sub || "";

  const x = el.querySelector(".toastX");
  x.addEventListener("click", () => el.remove());

  host.prepend(el);
  setTimeout(() => el.remove(), 9000);
}

function showUndoToast(subTitle, onUndo) {
  const host = els.toastHost;
  if (!host) return null;

  const el = document.createElement("div");
  el.className = "toast toastUndo";
  el.innerHTML = `
    <div>
      <div class="toastTitle">已删除</div>
      <div class="toastSub"></div>
    </div>
    <div class="toastUndoActions">
      <button type="button" class="toastUndoBtn">撤销</button>
      <button type="button" class="toastX" aria-label="关闭">✕</button>
    </div>
  `;
  el.querySelector(".toastSub").textContent = subTitle;

  el.querySelector(".toastUndoBtn").addEventListener("click", () => {
    onUndo();
  });
  el.querySelector(".toastX").addEventListener("click", () => {
    clearDeleteUndo();
    el.remove();
  });

  host.prepend(el);
  return el;
}

function maybeNotifySystem(title, body) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    try {
      new Notification(title, { body, silent: true });
    } catch {
      // ignore
    }
    return;
  }
  // 不主动弹权限打断；用户如果想要系统通知，第一次触发时再请求一次
  if (Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

function scheduleReminders() {
  for (const t of reminderTimers.values()) clearTimeout(t);
  reminderTimers.clear();

  const now = Date.now();
  for (const it of state.items) {
    if (!it || typeof it !== "object") continue;
    if (it.done) continue;
    if (!it.remindAt) continue;
    if (it.remindedAt) continue;
    const at = new Date(it.remindAt).getTime();
    if (Number.isNaN(at)) continue;

    const delay = at - now;
    if (delay <= 0) {
      void fireReminder(it.id);
      continue;
    }
    // setTimeout 有上限，太远的提醒下次 render/schedule 时再挂
    const safeDelay = Math.min(delay, 2 ** 31 - 1);
    const timer = setTimeout(() => void fireReminder(it.id), safeDelay);
    reminderTimers.set(it.id, timer);
  }
}

async function fireReminder(id) {
  const idx = findIndexById(id);
  if (idx < 0) return;
  const it = state.items[idx];
  if (!it || it.done) return;
  if (it.remindedAt) return;

  const ts = nowIso();
  if (useServer()) {
    try {
      const updated = await api("PATCH", `/api/todos/${encodeURIComponent(id)}`, { remindedAt: ts });
      state.items[idx] = updated;
      persistState();
    } catch {
      return;
    }
  } else {
    it.remindedAt = ts;
    persistState();
  }

  showToast({
    title: "提醒",
    sub: it.title,
  });
  maybeNotifySystem("Todo 提醒", it.title);

  const li = els.list?.querySelector?.(`li.item[data-id="${id}"]`);
  if (li) confettiPulse(li);

  scheduleReminders();
  render();
}
