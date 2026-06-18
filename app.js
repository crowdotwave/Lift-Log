const STORAGE_KEY = "ironlog.v2";
const LEGACY_KEY  = "ironlog.v1";
const $ = id => document.getElementById(id);

const GROUPS = [
  { id: "home",      name: "Home"      },
  { id: "chest",     name: "Chest"     },
  { id: "shoulders", name: "Shoulders" },
  { id: "back",      name: "Back"      },
  { id: "biceps",    name: "Biceps"    },
  { id: "triceps",   name: "Triceps"   },
  { id: "forearms",  name: "Forearms"  },
  { id: "legs",      name: "Legs"      },
  { id: "abs",       name: "Abs"       },
];
const GROUP_IDS = GROUPS.filter(g => g.id !== "home").map(g => g.id);

let data = load();
let selectedExercise = "";
let selectedExerciseB = "";
let chartMode = "weight";
let logMode = "single"; // "single" | "superset"

function currentExercise(slot) {
  if (slot === "b") {
    const el = $("exercise-b");
    return el ? el.value.trim() || selectedExerciseB : selectedExerciseB;
  }
  const el = $("exercise");
  return el ? el.value.trim() || selectedExercise : selectedExercise;
}

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
function load() {
  try {
    const v2 = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(v2)) return v2.filter(isValidSession);
    const v1 = JSON.parse(localStorage.getItem(LEGACY_KEY));
    if (Array.isArray(v1)) {
      const migrated = v1.map(s => ({ ...s, group: s.group || "chest" })).filter(isValidSession);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
  } catch {}
  return [];
}
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
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10);
}
function daysBetween(iso) {
  return Math.round((new Date(todayISO()+"T00:00") - new Date(iso+"T00:00")) / 86400000);
}
function lastWorkoutInfo(filter) {
  const list = filter ? data.filter(filter) : data;
  if (!list.length) return null;
  const last = list.reduce((a,b) => a.date > b.date ? a : b);
  return { date: last.date, days: daysBetween(last.date) };
}
function refreshStreak(groupId) {
  const el = $("streak");
  if (!el) return;
  const info = groupId ? lastWorkoutInfo(s => s.group === groupId) : lastWorkoutInfo();
  if (!info) {
    el.innerHTML = groupId
      ? `No ${GROUPS.find(g=>g.id===groupId).name.toLowerCase()} workouts yet — let's start.`
      : `No workouts logged yet — let's start.`;
    return;
  }
  const label = groupId
    ? `since last ${GROUPS.find(g=>g.id===groupId).name.toLowerCase()} workout`
    : "since last workout";
  el.innerHTML = `<b>${info.days + (info.days === 1 ? " day" : " days")}</b> ${label} · ${fmtDate(info.date)}`;
}
function fmtDate(iso) {
  return new Date(iso+"T00:00").toLocaleDateString(undefined, { month:"short", day:"numeric", year:"numeric" });
}
function fmtDateShort(iso) {
  return new Date(iso+"T00:00").toLocaleDateString(undefined, { month:"short", day:"numeric" });
}

function exercisesIn(group) {
  const seen = new Map();
  data.filter(s => s.group === group).forEach(s => {
    const k = s.exercise.toLowerCase();
    if (!seen.has(k)) seen.set(k, s.exercise);
  });
  return [...seen.values()].sort();
}
function allExercises() {
  const seen = new Map();
  data.forEach(s => {
    const k = s.exercise.toLowerCase();
    if (!seen.has(k)) seen.set(k, s.exercise);
  });
  return [...seen.values()].sort();
}
function canonicalExercise(name, group) {
  const t = name.trim();
  if (!t) return "";
  const match = data.find(s => s.group === group && s.exercise.toLowerCase() === t.toLowerCase());
  return match ? match.exercise : t.replace(/\s+/g," ");
}
function lastSession(name, group) {
  const matches = data.filter(s => s.exercise.toLowerCase() === name.toLowerCase() && s.group === group);
  if (!matches.length) return null;
  return matches.sort((a,b) => b.date.localeCompare(a.date))[0];
}
function isPR(session) {
  const prior = data.filter(s =>
    s.exercise.toLowerCase() === session.exercise.toLowerCase() &&
    s.group === session.group && s.id !== session.id && s.date <= session.date
  );
  if (!prior.length) return true;
  return session.weight > Math.max(...prior.map(s => s.weight));
}

function updateGlobalStats() {
  $("stat-sessions").textContent = new Set(data.map(s => s.date)).size;
  if (data.length) {
    const first = data.reduce((a,b) => a.date < b.date ? a : b).date;
    $("stat-days").textContent = daysBetween(first) + 1;
  } else { $("stat-days").textContent = 0; }
}

function renderTabs(activeId) {
  $("tabs").innerHTML = GROUPS.map(g =>
    `<a href="#/${g.id}" data-g="${g.id}" class="${g.id===activeId?'active':''}">${g.name}</a>`
  ).join("");
}

/* ---------- HOME ---------- */
function renderHome() {
  renderTabs("home");
  const cards = GROUPS.filter(g => g.id !== "home").map(g => {
    const sessions = data.filter(s => s.group === g.id);
    const count = new Set(sessions.map(s => s.date)).size;
    const exercises = new Set(sessions.map(s => s.exercise)).size;
    const lastDate = sessions.length ? sessions.sort((a,b)=>b.date.localeCompare(a.date))[0].date : null;
    return `
      <a class="group-card" data-g="${g.id}" href="#/${g.id}">
        <div class="group-name">${g.name}</div>
        <div class="group-meta">
          <b>${count}</b> sessions · <b>${exercises}</b> exercises<br/>
          ${lastDate ? `Last: ${fmtDate(lastDate)}` : "No sessions yet"}
        </div>
      </a>`;
  }).join("");
  const info = lastWorkoutInfo();
  const stat = info
    ? `<div class="streak" id="streak"><b>${info.days + (info.days===1?" day":" days")}</b> since last workout · ${fmtDate(info.date)}</div>`
    : `<div class="streak" id="streak">No workouts logged yet — let's start.</div>`;
  $("view").innerHTML = `
    <div class="page-title"><div>
      <h1>Welcome back</h1>
      <div class="sub">Pick a muscle group to log a set or check progress.</div>
    </div></div>
    ${stat}
    <div class="group-grid">${cards}</div>
    <div style="margin-top:32px;display:flex;justify-content:center;">
      <button class="ghost" id="csv-btn" style="width:auto;padding:10px 20px;">Download CSV</button>
    </div>
  `;
  $("csv-btn")?.addEventListener("click", downloadCSV);
}

function csvEscape(v) {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
}
function downloadCSV() {
  if (!data.length) return;
  const rows = [["date","group","exercise","weight_lbs","reps","sets","superset_id"]];
  [...data].sort((a,b)=>b.date.localeCompare(a.date)).forEach(s => {
    rows.push([s.date, s.group, s.exercise, s.weight, s.reps, s.sets, s.supersetId||""]);
  });
  const csv = rows.map(r=>r.map(csvEscape).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
  a.download = `liftlog-${todayISO()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ---------- GROUP VIEW ---------- */
function renderGroup(groupId) {
  const group = GROUPS.find(g => g.id === groupId);
  if (!group) { location.hash = "#/"; return; }
  selectedExercise = "";
  selectedExerciseB = "";
  chartMode = "weight";
  logMode = "single";
  renderTabs(groupId);

  const info = lastWorkoutInfo(s => s.group === groupId);
  const stat = info
    ? `<div class="streak" id="streak"><b>${info.days+(info.days===1?" day":" days")}</b> since last ${group.name.toLowerCase()} workout · ${fmtDate(info.date)}</div>`
    : `<div class="streak" id="streak">No ${group.name.toLowerCase()} workouts yet — let's start.</div>`;

  $("view").innerHTML = `
    <div class="page-title" data-g="${group.id}">
      <div>
        <h1>${group.name} <span class="gradient-text">Day</span></h1>
        <div class="sub">Log your sets and watch the line go up.</div>
      </div>
    </div>
    ${stat}
    <div class="grid">
      <section class="card">
        <h2>Log a Set</h2>

        <div class="mode-toggle">
          <button id="btn-single" class="active">Single</button>
          <button id="btn-superset">Superset</button>
        </div>

        <div id="log-form"></div>
        <button id="add-btn">Log Set</button>
      </section>

      <section class="card">
        <div class="chart-header">
          <h2>Progress — <span id="chart-title" class="gradient-text">${group.name}</span></h2>
          <div class="chart-tabs">
            <button class="chart-tab active" id="tab-weight">Weight</button>
            <button class="chart-tab" id="tab-volume">Volume</button>
          </div>
        </div>
        <div class="last-hint" id="last-hint" style="display:none;"></div>
        <div class="chart-wrap"><canvas id="chart"></canvas></div>
        <div class="history" id="history"></div>
      </section>
    </div>
  `;

  $("date-hidden") || (() => {})(); // noop
  renderLogForm(groupId);

  $("btn-single").addEventListener("click", () => {
    logMode = "single";
    $("btn-single").classList.add("active");
    $("btn-superset").classList.remove("active");
    renderLogForm(groupId);
  });
  $("btn-superset").addEventListener("click", () => {
    logMode = "superset";
    $("btn-superset").classList.add("active");
    $("btn-single").classList.remove("active");
    renderLogForm(groupId);
  });

  $("tab-weight").addEventListener("click", () => {
    chartMode = "weight";
    $("tab-weight").classList.add("active");
    $("tab-volume").classList.remove("active");
    renderChart(groupId);
  });
  $("tab-volume").addEventListener("click", () => {
    chartMode = "volume";
    $("tab-volume").classList.add("active");
    $("tab-weight").classList.remove("active");
    renderChart(groupId);
  });

  $("add-btn").addEventListener("click", () => addSet(groupId));
  renderChart(groupId);
  renderHistory(groupId);
}

function renderLogForm(groupId) {
  const form = $("log-form");
  if (logMode === "single") {
    form.innerHTML = `
      <div class="field">
        <label for="exercise">Exercise</label>
        <input id="exercise" placeholder="New exercise? Type it here..." autocomplete="off"/>
        <div class="ex-pills" id="ex-pills"></div>
      </div>
      <div class="row">
        <div class="field"><label>Weight (lbs)</label><input id="weight" type="number" step="0.5" inputmode="decimal" placeholder="0"/></div>
        <div class="field"><label>Reps</label><input id="reps" type="number" inputmode="numeric" placeholder="0"/></div>
        <div class="field"><label>Sets</label><input id="sets" type="number" inputmode="numeric" placeholder="0"/></div>
      </div>
      <div class="field"><label>Date</label><input id="date" type="date"/></div>
    `;
    $("date").value = todayISO();
    $("date").addEventListener("click", () => { try { $("date").showPicker(); } catch {} });
    $("exercise").addEventListener("input",
