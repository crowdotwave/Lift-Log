const STORAGE_KEY = "ironlog.v2";
const $ = (id) => document.getElementById(id);

const GROUPS = [
  "chest","shoulders","back","biceps","triceps","forearms","legs","abs"
];

function isValidSession(s) {
  return s && typeof s === "object"
    && typeof s.id === "string"
    && typeof s.group === "string"
    && typeof s.exercise === "string" && s.exercise.trim()
    && typeof s.weight === "number" && !isNaN(s.weight)
    && typeof s.reps === "number" && !isNaN(s.reps)
    && typeof s.sets === "number" && !isNaN(s.sets)
    && typeof s.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.date);
}
let data = [];
try {
  const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
  if (Array.isArray(parsed)) data = parsed.filter(isValidSession);
} catch {}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  if (window.LiftLogSync) window.LiftLogSync.schedulePush();
}
function reloadFromStorage() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    data = Array.isArray(parsed) ? parsed.filter(isValidSession) : [];
  } catch { data = []; }
}
function todayISO() {
  const d = new Date(); const off = d.getTimezoneOffset();
  return new Date(d.getTime()-off*60000).toISOString().slice(0,10);
}
function fmtDate(iso) {
  return new Date(iso+"T00:00").toLocaleDateString(undefined,{month:"short",day:"numeric"});
}
function cap(s) { return s[0].toUpperCase() + s.slice(1); }

let activeGroup = null;
let selectedExercise = "";
const currentExercise = () => $("exercise").value.trim() || selectedExercise;

function showGroups() {
  activeGroup = null;
  $("view-groups").style.display = "";
  $("view-form").style.display = "none";
  renderHomeStreak();
}
function renderHomeStreak() {
  const el = $("home-streak");
  if (!data.length) { el.innerHTML = `No workouts logged yet.`; return; }
  const last = data.reduce((a,b) => a.date > b.date ? a : b);
  const d = daysBetween(last.date);
  el.innerHTML = `<b>${d} ${d===1?"day":"days"}</b> since last workout · ${fmtDate(last.date)}`;
}
function showForm(g) {
  activeGroup = g;
  selectedExercise = "";
  $("view-groups").style.display = "none";
  $("view-form").style.display = "";
  const title = $("form-title");
  title.textContent = cap(g);
  title.dataset.g = g;
  $("exercise").value = "";
  $("weight").value = "";
  $("reps").value = "";
  $("sets").value = "";
  $("date").value = todayISO();
  renderStreak();
  refreshDatalist();
  updateHint();
  $("exercise").focus();
}

function daysBetween(iso) {
  const a = new Date(iso + "T00:00");
  const b = new Date(todayISO() + "T00:00");
  return Math.round((b - a) / 86400000);
}
function renderStreak() {
  const list = data.filter(s => s.group === activeGroup);
  const el = $("streak");
  if (!list.length) { el.innerHTML = `No ${activeGroup} workouts yet.`; return; }
  const last = list.reduce((a,b) => a.date > b.date ? a : b);
  const d = daysBetween(last.date);
  el.innerHTML = `<b>${d} ${d===1?"day":"days"}</b> since last ${activeGroup} · ${fmtDate(last.date)}`;
}

function renderGroupBtns() {
  $("group-btns").innerHTML = GROUPS.map(g =>
    `<button type="button" data-g="${g}" class="active">${cap(g)}</button>`
  ).join("");
  $("group-btns").querySelectorAll("button").forEach(b => {
    b.addEventListener("click", () => showForm(b.dataset.g));
  });
}

function exercisesIn(group) {
  const seen = new Map();
  data.filter(s => s.group === group).forEach(s => {
    const k = s.exercise.toLowerCase();
    if (!seen.has(k)) seen.set(k, s.exercise);
  });
  return [...seen.values()].sort();
}
function canonicalExercise(name, group) {
  const trimmed = name.trim();
  if (!trimmed) return "";
  const match = data.find(s => s.group === group && s.exercise.toLowerCase() === trimmed.toLowerCase());
  return match ? match.exercise : trimmed.replace(/\s+/g, " ");
}
function lastSession(name, group) {
  const m = data.filter(s => s.exercise.toLowerCase()===name.toLowerCase() && s.group===group);
  if (!m.length) return null;
  m.sort((a,b)=>b.date.localeCompare(a.date));
  return m[0];
}
function isPR(s) {
  const prior = data.filter(x =>
    x.exercise.toLowerCase()===s.exercise.toLowerCase() &&
    x.group===s.group && x.id!==s.id && x.date<=s.date);
  if (!prior.length) return true;
  return s.weight > Math.max(...prior.map(p=>p.weight));
}

function refreshDatalist() {
  const g = activeGroup;
  const list = exercisesIn(g);
  const current = selectedExercise.toLowerCase();
  $("ex-pills").innerHTML = list.map(e =>
    `<button type="button" data-ex="${e}" class="${e.toLowerCase()===current?'active':''}">${e}</button>`
  ).join("");
  $("ex-pills").querySelectorAll("button").forEach(b => {
    b.addEventListener("click", () => {
      const same = selectedExercise.toLowerCase() === b.dataset.ex.toLowerCase();
      selectedExercise = same ? "" : b.dataset.ex;
      $("exercise").value = "";
      refreshDatalist();
      updateHint();
    });
  });
}
function updateHint() {
  const g = activeGroup;
  const name = currentExercise();
  if (!name) { $("hint").innerHTML = "Pick an exercise to see your last session."; return; }
  const last = lastSession(name, g);
  if (!last) { $("hint").innerHTML = `No history for <b>${name}</b> yet.`; return; }
  $("hint").innerHTML = `Last: <b>${last.weight}kg × ${last.reps} × ${last.sets}</b> on ${fmtDate(last.date)} → try <b>${last.weight+2.5}kg</b>`;
}
function renderRecent() {}

$("exercise").addEventListener("input", () => { updateHint(); refreshDatalist(); });
$("date").addEventListener("click", () => { try { $("date").showPicker(); } catch {} });

$("log-btn").addEventListener("click", () => {
  const group = activeGroup;
  const exercise = canonicalExercise(currentExercise(), group);
  const weight = parseFloat($("weight").value);
  const reps = parseInt($("reps").value);
  const sets = parseInt($("sets").value);
  const date = $("date").value || todayISO();
  const invalid =
    !exercise ||
    isNaN(weight) || weight < 0 || weight > 10000 ||
    isNaN(reps)   || reps   <= 0 || reps   > 1000 ||
    isNaN(sets) || sets <= 0 || sets > 100 ||
    date > todayISO();
  if (invalid) {
    $("log-btn").animate(
      [{transform:"translateX(0)"},{transform:"translateX(-5px)"},{transform:"translateX(5px)"},{transform:"translateX(0)"}],
      {duration: 220});
    return;
  }
  data.push({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()+Math.random()),
    group, exercise, weight, reps, sets, date
  });
  save();
  selectedExercise = exercise;
  $("exercise").value = "";
  $("weight").value = ""; $("reps").value = "";
  refreshDatalist(); updateHint(); renderStreak();
  const t = $("toast"); t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"), 1200);
});

function openSyncMenu(anchor) {
  document.getElementById("sync-menu")?.remove();
  const menu = document.createElement("div");
  menu.id = "sync-menu";
  menu.style.cssText = "position:absolute;top:42px;right:16px;background:#0d1a2e;border:1px solid rgba(120,180,255,0.2);border-radius:8px;padding:4px;z-index:30;box-shadow:0 8px 24px rgba(0,0,0,0.5);min-width:140px;";
  menu.innerHTML = `
    <div style="padding:8px 12px;font-size:11px;color:#8ea0bc;border-bottom:1px solid rgba(120,180,255,0.1);">Synced with Google</div>
    <button type="button" id="sync-out" style="width:100%;text-align:left;padding:8px 12px;background:transparent;color:#e7f0ff;border:0;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;box-shadow:none;">Sign out</button>
  `;
  document.body.appendChild(menu);
  menu.querySelector("#sync-out").addEventListener("click", async () => {
    menu.remove();
    await window.LiftLogSync.signOut();
    renderSyncBtn();
    showSyncBanner("Signed out. Switched to local-only mode.");
  });
  setTimeout(() => {
    document.addEventListener("click", function close(ev) {
      if (!menu.contains(ev.target) && ev.target !== anchor) {
        menu.remove();
        document.removeEventListener("click", close);
      }
    });
  }, 0);
}

function showSyncBanner(text) {
  let el = document.getElementById("sync-banner");
  if (!el) {
    el = document.createElement("div");
    el.id = "sync-banner";
    el.style.cssText = "position:fixed;left:12px;right:12px;bottom:12px;padding:10px 12px;background:rgba(96,165,250,0.12);border:1px solid rgba(96,165,250,0.4);border-radius:10px;color:#cfe1ff;font-size:11.5px;line-height:1.4;z-index:20;";
    document.body.appendChild(el);
  }
  el.textContent = text;
  clearTimeout(showSyncBanner._t);
  showSyncBanner._t = setTimeout(() => el.remove(), 4500);
}

function renderSyncBtn() {
  const btn = $("sync-btn");
  if (!btn || !window.LiftLogSync) return;
  const s = window.LiftLogSync.state();
  btn.classList.toggle("on", s.signedIn);
  btn.classList.toggle("syncing", s.syncing);
  btn.textContent = s.syncing ? "Syncing…" : (s.signedIn ? "Synced" : "Sign in");
  btn.title = s.signedIn ? "Click to sign out" : "Sign in with Google";
}
if (window.LiftLogSync) {
  window.LiftLogSync.onChange(renderSyncBtn);
  renderSyncBtn();
  $("sync-btn").addEventListener("click", async (e) => {
    const s = window.LiftLogSync.state();
    if (s.signedIn) {
      openSyncMenu(e.currentTarget);
      return;
    } else {
      const r = await window.LiftLogSync.signIn();
      if (r.ok) {
        reloadFromStorage();
        renderHomeStreak();
        if (activeGroup) { refreshDatalist(); updateHint(); renderStreak(); }
      } else if (r.reason === "not-available") {
        showSyncBanner("Cloud sync is under development and coming soon. Your data is safely stored on this device.");
      }
    }
  });
  window.addEventListener("liftlog:synced", () => {
    reloadFromStorage();
    renderHomeStreak();
    if (activeGroup) { refreshDatalist(); updateHint(); renderStreak(); }
  });
}

$("open-full").addEventListener("click", (e) => {
  e.preventDefault();
  const url = chrome.runtime.getURL("index.html");
  chrome.tabs.create({ url });
});

renderGroupBtns();
showGroups();
$("back-btn").addEventListener("click", showGroups);
