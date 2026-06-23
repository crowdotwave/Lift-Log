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
let logMode = "single";

// sticky form state
let stickyWeight = "", stickyReps = "", stickySets = "1";
let stickyWeightB = "", stickyRepsB = "";

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
    ? `<div class="streak" id="streak"><b>${info.days+(info.days===1?" day":" days")}</b> since last workout · ${fmtDate(info.date)}</div>`
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
  stickyWeight = ""; stickyReps = ""; stickySets = "1";
  stickyWeightB = ""; stickyRepsB = "";
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
        <div id="chart-legend" class="chart-legend"></div>
        <div class="history" id="history"></div>
      </section>
    </div>
  `;

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

function weightIncrementHTML() {
  return `<div class="weight-row">
    <input id="weight" type="number" step="0.5" inputmode="decimal" placeholder="0" style="flex:1"/>
    <button type="button" class="inc-btn" data-field="weight" data-amt="2.5">+2.5</button>
    <button type="button" class="inc-btn" data-field="weight" data-amt="5">+5</button>
  </div>`;
}
function weightIncrementBHTML() {
  return `<div class="weight-row">
    <input id="weight-b" type="number" step="0.5" inputmode="decimal" placeholder="0" style="flex:1"/>
    <button type="button" class="inc-btn" data-field="weight-b" data-amt="2.5">+2.5</button>
    <button type="button" class="inc-btn" data-field="weight-b" data-amt="5">+5</button>
  </div>`;
}

function bindIncrementBtns() {
  document.querySelectorAll(".inc-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const field = btn.dataset.field;
      const amt = parseFloat(btn.dataset.amt);
      const input = $(field);
      if (!input) return;
      const cur = parseFloat(input.value) || 0;
      input.value = (cur + amt).toString();
      // update sticky
      if (field === "weight") stickyWeight = input.value;
      if (field === "weight-b") stickyWeightB = input.value;
    });
  });
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
      <div class="field"><label>Weight (lbs)</label>${weightIncrementHTML()}</div>
      <div class="row">
        <div class="field"><label>Reps</label><input id="reps" type="number" inputmode="numeric" placeholder="0"/></div>
        <div class="field"><label>Sets</label><input id="sets" type="number" inputmode="numeric" placeholder="1"/></div>
      </div>
      <div class="field"><label>Date</label><input id="date" type="date"/></div>
    `;
    $("date").value = todayISO();
    $("date").addEventListener("click", () => { try { $("date").showPicker(); } catch {} });

    // restore sticky values
    if (stickyWeight) $("weight").value = stickyWeight;
    if (stickyReps)   $("reps").value   = stickyReps;
    $("sets").value = stickySets || "1";

    $("weight").addEventListener("input", () => stickyWeight = $("weight").value);
    $("reps").addEventListener("input",   () => stickyReps   = $("reps").value);
    $("sets").addEventListener("input",   () => stickySets   = $("sets").value);

    $("exercise").addEventListener("input", () => {
      updateHint(groupId); renderHistory(groupId); renderChart(groupId); refreshDatalist(groupId);
    });
    bindIncrementBtns();
    refreshDatalist(groupId);
    updateHint(groupId);
  } else {
    form.innerHTML = `
      <div class="field">
        <label>Exercise A (this group)</label>
        <input id="exercise" placeholder="e.g. Bench Press" autocomplete="off"/>
        <div class="ex-pills" id="ex-pills"></div>
      </div>
      <div class="field"><label>Weight A (lbs)</label>${weightIncrementHTML()}</div>
      <div class="row">
        <div class="field"><label>Reps A</label><input id="reps" type="number" inputmode="numeric" placeholder="0"/></div>
        <div class="field"><label>Sets</label><input id="sets" type="number" inputmode="numeric" placeholder="1"/></div>
      </div>

      <div class="superset-divider">Paired with</div>

      <div class="field">
        <label>Exercise B (any group)</label>
        <input id="exercise-b" placeholder="e.g. Bent Over Row" autocomplete="off"/>
        <div class="ex-pills" id="ex-pills-b"></div>
      </div>
      <div class="field"><label>Weight B (lbs)</label>${weightIncrementBHTML()}</div>
      <div class="field">
        <label>Reps B</label>
        <input id="reps-b" type="number" inputmode="numeric" placeholder="0"/>
      </div>

      <div class="field"><label>Date</label><input id="date" type="date"/></div>
    `;
    $("date").value = todayISO();
    $("date").addEventListener("click", () => { try { $("date").showPicker(); } catch {} });

    // restore sticky
    if (stickyWeight)  $("weight").value   = stickyWeight;
    if (stickyReps)    $("reps").value     = stickyReps;
    if (stickyWeightB) $("weight-b").value = stickyWeightB;
    if (stickyRepsB)   $("reps-b").value   = stickyRepsB;
    $("sets").value = stickySets || "1";

    $("weight").addEventListener("input",   () => stickyWeight  = $("weight").value);
    $("reps").addEventListener("input",     () => stickyReps    = $("reps").value);
    $("weight-b").addEventListener("input", () => stickyWeightB = $("weight-b").value);
    $("reps-b").addEventListener("input",   () => stickyRepsB   = $("reps-b").value);
    $("sets").addEventListener("input",     () => stickySets    = $("sets").value);

    $("exercise").addEventListener("input", () => {
      updateHint(groupId); renderHistory(groupId); renderChart(groupId); refreshDatalist(groupId);
    });
    $("exercise-b").addEventListener("input", () => refreshDatalistB());

    bindIncrementBtns();
    refreshDatalist(groupId);
    refreshDatalistB();
    updateHint(groupId);
  }
}

function refreshDatalist(groupId) {
  const pillsEl = $("ex-pills");
  if (!pillsEl) return;
  const list = exercisesIn(groupId);
  const cur = selectedExercise.toLowerCase();
  pillsEl.innerHTML = list.map(e =>
    `<button type="button" data-ex="${e}" class="${e.toLowerCase()===cur?'active':''}">${e}</button>`
  ).join("");
  pillsEl.querySelectorAll("button").forEach(b => {
    b.addEventListener("click", () => {
      const same = selectedExercise.toLowerCase() === b.dataset.ex.toLowerCase();
      selectedExercise = same ? "" : b.dataset.ex;
      $("exercise").value = "";
      updateHint(groupId); renderHistory(groupId); renderChart(groupId); refreshDatalist(groupId);
    });
  });
}

function refreshDatalistB() {
  const pillsEl = $("ex-pills-b");
  if (!pillsEl) return;
  const list = allExercises();
  const cur = selectedExerciseB.toLowerCase();
  const query = ($("exercise-b")?.value || "").trim().toLowerCase();
  const filtered = query ? list.filter(e => e.toLowerCase().includes(query)) : list;
  pillsEl.innerHTML = filtered.slice(0,12).map(e =>
    `<button type="button" data-ex="${e}" class="${e.toLowerCase()===cur?'active':''}">${e}</button>`
  ).join("");
  pillsEl.querySelectorAll("button").forEach(b => {
    b.addEventListener("click", () => {
      const same = selectedExerciseB.toLowerCase() === b.dataset.ex.toLowerCase();
      selectedExerciseB = same ? "" : b.dataset.ex;
      $("exercise-b").value = "";
      refreshDatalistB();
    });
  });
}

function updateHint(groupId) {
  const name = currentExercise();
  const hint = $("last-hint");
  if (!hint) return;
  if (!name) { hint.style.display = "none"; return; }
  const last = lastSession(name, groupId);
  hint.style.display = "";
  if (!last) { hint.innerHTML = `No history for <b>${name}</b> yet — let's start.`; return; }
  hint.innerHTML = `Last <b>${name}</b>: ${last.weight}lbs × ${last.reps} × ${last.sets} on ${fmtDate(last.date)} → try <b>${last.weight+5}lbs</b>`;
}

function flashLogBtn() {
  const btn = $("add-btn");
  btn.textContent = "Logged ✓";
  btn.style.background = "#10d9a3";
  btn.style.color = "#000";
  setTimeout(() => {
    btn.textContent = "Log Set";
    btn.style.background = "";
    btn.style.color = "";
  }, 1000);
}

function addSet(groupId) {
  const date = $("date").value || todayISO();
  if (date > todayISO()) { shake(); return; }

  if (logMode === "superset") {
    const exA = canonicalExercise(currentExercise(), groupId);
    const weightA = parseFloat($("weight").value);
    const repsA = parseInt($("reps").value);
    const sets = parseInt($("sets").value);
    const exBRaw = currentExercise("b");
    const matchB = data.find(s => s.exercise.toLowerCase() === exBRaw.toLowerCase());
    const groupB = matchB ? matchB.group : groupId;
    const exB = canonicalExercise(exBRaw, groupB);
    const weightB = parseFloat($("weight-b").value);
    const repsB = parseInt($("reps-b").value);

    const invalid = !exA || !exB ||
      isNaN(weightA)||weightA<0 || isNaN(repsA)||repsA<=0 ||
      isNaN(weightB)||weightB<0 || isNaN(repsB)||repsB<=0 ||
      isNaN(sets)||sets<=0||sets>100;
    if (invalid) { shake(); return; }

    const supersetId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    data.push({ id: crypto.randomUUID(), group: groupId, exercise: exA, weight: weightA, reps: repsA, sets, date, supersetId });
    data.push({ id: crypto.randomUUID(), group: groupB,  exercise: exB, weight: weightB, reps: repsB, sets, date, supersetId });
    save();
    selectedExercise = exA;
    selectedExerciseB = exB;
    // keep weights/reps sticky, clear exercise text fields
    $("exercise").value = "";
    $("exercise-b").value = "";
    refreshDatalist(groupId); refreshDatalistB();
    updateHint(groupId); renderHistory(groupId); renderChart(groupId);
    refreshStreak(groupId); updateGlobalStats();
    flashLogBtn();

  } else {
    const exercise = canonicalExercise(currentExercise(), groupId);
    const weight = parseFloat($("weight").value);
    const reps = parseInt($("reps").value);
    const sets = parseInt($("sets").value);
    const invalid = !exercise ||
      isNaN(weight)||weight<0||weight>10000 ||
      isNaN(reps)||reps<=0||reps>1000 ||
      isNaN(sets)||sets<=0||sets>100;
    if (invalid) { shake(); return; }
    data.push({ id: crypto.randomUUID(), group: groupId, exercise, weight, reps, sets, date });
    save();
    selectedExercise = exercise;
    // keep values sticky — only clear exercise text
    $("exercise").value = "";
    refreshDatalist(groupId); updateHint(groupId);
    renderHistory(groupId); renderChart(groupId);
    refreshStreak(groupId); updateGlobalStats();
    flashLogBtn();
  }
}

function shake() {
  $("add-btn").animate(
    [{transform:"translateX(0)"},{transform:"translateX(-6px)"},{transform:"translateX(6px)"},{transform:"translateX(0)"}],
    {duration:250}
  );
}

function renderHistory(groupId) {
  const filter = currentExercise().toLowerCase();
  const container = $("history");
  if (!filter) {
    container.innerHTML = `<div class="empty">Select an exercise to see history.</div>`;
    return;
  }
  const list = data
    .filter(s => s.group === groupId && s.exercise.toLowerCase() === filter)
    .sort((a,b) => b.date.localeCompare(a.date));
  if (!list.length) {
    container.innerHTML = `<div class="empty">No sessions yet for this exercise.</div>`;
    return;
  }

  const rendered = new Set();
  let html = "";
  for (const s of list) {
    if (rendered.has(s.id)) continue;
    if (s.supersetId) {
      const partner = data.find(p => p.supersetId === s.supersetId && p.id !== s.id);
      html += `<div class="superset-group">
        <div class="superset-label">⚡ Superset${partner ? ` · paired with ${partner.exercise}` : ""}</div>
        ${sessionRowHTML(s)}
        ${partner ? sessionRowHTML(partner) : ""}
      </div>`;
      rendered.add(s.id);
      if (partner) rendered.add(partner.id);
    } else {
      html += sessionRowHTML(s);
      rendered.add(s.id);
    }
  }
  container.innerHTML = html;

  container.querySelectorAll("button.del").forEach(b => {
    b.addEventListener("click", () => {
      const id = b.dataset.id;
      const entry = data.find(s => s.id === id);
      if (entry?.supersetId) {
        data.filter(s => s.supersetId === entry.supersetId)
            .forEach(s => { if (window.LiftLogSync) window.LiftLogSync.addTombstone(s.id); });
        data = data.filter(s => s.supersetId !== entry.supersetId);
      } else {
        if (window.LiftLogSync) window.LiftLogSync.addTombstone(id);
        data = data.filter(s => s.id !== id);
      }
      save();
      refreshDatalist(groupId); renderHistory(groupId); renderChart(groupId);
      refreshStreak(groupId); updateGlobalStats();
    });
  });
}

function sessionRowHTML(s) {
  const pr = isPR(s);
  const vol = (s.weight * s.reps * s.sets).toLocaleString();
  return `
    <div class="session">
      <div>
        <div class="vals">
          ${s.weight}lbs × ${s.reps} × ${s.sets}
          ${pr ? '<span class="pr-badge">PR</span>' : ''}
        </div>
        <div class="meta">${s.exercise} · ${fmtDate(s.date)}</div>
      </div>
      <div class="session-vol">${vol} vol</div>
      <button class="del" data-id="${s.id}" title="Delete">✕</button>
    </div>`;
}

/* ---------- CHART ---------- */
function getChartData(groupId, exerciseName) {
  const filter = exerciseName.toLowerCase();
  const points = data
    .filter(s => s.group === groupId && s.exercise.toLowerCase() === filter)
    .sort((a,b) => a.date.localeCompare(b.date));

  const byDate = {};
  if (chartMode === "volume") {
    points.forEach(s => { byDate[s.date] = (byDate[s.date]||0) + s.weight*s.reps*s.sets; });
  } else {
    points.forEach(s => { if (!byDate[s.date]||s.weight>byDate[s.date]) byDate[s.date]=s.weight; });
  }
  const labels = Object.keys(byDate).sort();
  return { labels, values: labels.map(d => byDate[d]) };
}

function getSupersetPartner(exerciseName, groupId) {
  // find an entry for this exercise that has a supersetId
  const withSuperset = data.find(s =>
    s.exercise.toLowerCase() === exerciseName.toLowerCase() &&
    s.group === groupId && s.supersetId
  );
  if (!withSuperset) return null;
  const partner = data.find(p => p.supersetId === withSuperset.supersetId && p.id !== withSuperset.id);
  return partner || null;
}

function renderChart(groupId) {
  const filter = currentExercise().toLowerCase();
  const title = filter ? currentExercise() : GROUPS.find(g=>g.id===groupId).name;
  $("chart-title").textContent = title;

  const legend = $("chart-legend");

  if (!filter) {
    drawChart([], [], null, null, null, null);
    if (legend) legend.innerHTML = "";
    return;
  }

  const { labels: labelsA, values: valuesA } = getChartData(groupId, filter);

  // check for superset partner
  const partner = getSupersetPartner(filter, groupId);
  if (partner) {
    // merge labels from both exercises
    const { labels: labelsB, values: valuesB } = getChartData(partner.group, partner.exercise);
    const allLabels = [...new Set([...labelsA, ...labelsB])].sort();

    // build aligned value arrays (null for missing dates)
    const mapA = Object.fromEntries(labelsA.map((l,i) => [l, valuesA[i]]));
    const mapB = Object.fromEntries(labelsB.map((l,i) => [l, valuesB[i]]));
    const vA = allLabels.map(l => mapA[l] ?? null);
    const vB = allLabels.map(l => mapB[l] ?? null);

    drawChart(allLabels, vA, vB, filter, partner.exercise, groupId);
    if (legend) legend.innerHTML = `
      <span class="legend-item"><span class="legend-dot" style="background:#3b82f6"></span>${currentExercise()}</span>
      <span class="legend-item"><span class="legend-dot" style="background:#a78bfa"></span>${partner.exercise}</span>
    `;
  } else {
    drawChart(labelsA, valuesA, null, null, null, null);
    if (legend) legend.innerHTML = "";
  }
}

function drawChart(labels, valuesA, valuesB, nameA, nameB, groupId) {
  const canvas = $("chart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const W = rect.width, H = rect.height;
  ctx.clearRect(0,0,W,H);

  const hasData = valuesA && valuesA.some(v => v !== null);
  if (!hasData) {
    ctx.fillStyle = "#4a5568";
    ctx.font = "14px -apple-system,sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No data yet — log a set to see your progress", W/2, H/2);
    return;
  }

  const pad = { l:48, r:16, t:20, b:32 };
  const cw = W - pad.l - pad.r;
  const ch = H - pad.t - pad.b;

  // combine both series to get global min/max
  const allVals = [...(valuesA||[]), ...(valuesB||[])].filter(v => v !== null);
  const min = Math.min(...allVals), max = Math.max(...allVals);
  const range = max - min || 1;
  const yMin = Math.max(0, min - range*0.15);
  const yMax = max + range*0.15;

  // grid
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  ctx.font = "10px -apple-system,sans-serif";
  ctx.fillStyle = "#4a5568";
  ctx.textAlign = "right";
  for (let i=0; i<=4; i++) {
    const y = pad.t + (ch*i/4);
    const v = yMax - ((yMax-yMin)*i/4);
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W-pad.r, y); ctx.stroke();
    const lbl = chartMode==="volume" ? (v>=1000?(v/1000).toFixed(1)+"k":v.toFixed(0)) : v.toFixed(0);
    ctx.fillText(lbl, pad.l-6, y+4);
  }

  const xAt = i => pad.l + (labels.length===1 ? cw/2 : cw*i/(labels.length-1));
  const yAt = v => v === null ? null : pad.t + ch*(1-(v-yMin)/(yMax-yMin));

  function drawSeries(values, color, fillColor, dotColor) {
    if (!values || !values.some(v => v !== null)) return;

    // fill
    const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t+ch);
    grad.addColorStop(0, fillColor);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.beginPath();
    let started = false;
    values.forEach((v,i) => {
      if (v === null) return;
      if (!started) { ctx.moveTo(xAt(i), pad.t+ch); ctx.lineTo(xAt(i), yAt(v)); started=true; }
      else ctx.lineTo(xAt(i), yAt(v));
    });
    // close fill to bottom
    for (let i=values.length-1; i>=0; i--) {
      if (values[i] !== null) { ctx.lineTo(xAt(i), pad.t+ch); break; }
    }
    ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();

    // line
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = "round";
    ctx.beginPath();
    let first = true;
    values.forEach((v,i) => {
      if (v === null) { first = true; return; }
      if (first) { ctx.moveTo(xAt(i), yAt(v)); first=false; }
      else ctx.lineTo(xAt(i), yAt(v));
    });
    ctx.stroke();

    // dots
    values.forEach((v,i) => {
      if (v === null) return;
      ctx.beginPath(); ctx.arc(xAt(i), yAt(v), 3.5, 0, Math.PI*2);
      ctx.fillStyle = "#000"; ctx.fill();
      ctx.strokeStyle = dotColor; ctx.lineWidth = 2; ctx.stroke();
    });
  }

  drawSeries(valuesA, "#3b82f6", "rgba(59,130,246,0.2)", "#60a5fa");
  if (valuesB) drawSeries(valuesB, "#a78bfa", "rgba(167,139,250,0.15)", "#c4b5fd");

  // x labels
  ctx.fillStyle = "#4a5568"; ctx.textAlign = "center";
  const step = Math.max(1, Math.ceil(labels.length/6));
  labels.forEach((l,i) => {
    if (i%step!==0 && i!==labels.length-1) return;
    ctx.fillText(fmtDateShort(l), xAt(i), H-8);
  });
}

/* ---------- Router ---------- */
function route() {
  const hash = location.hash.replace(/^#\/?/,"");
  if (!hash||hash==="home") return renderHome();
  if (GROUP_IDS.includes(hash)) return renderGroup(hash);
  location.hash="#/";
}
window.addEventListener("hashchange", route);
window.addEventListener("resize", () => {
  if ($("chart")) {
    const hash = location.hash.replace(/^#\/?/,"");
    if (GROUP_IDS.includes(hash)) renderChart(hash);
  }
});

function openSyncMenu(anchor) {
  document.getElementById("sync-menu")?.remove();
  const rect = anchor.getBoundingClientRect();
  const menu = document.createElement("div");
  menu.id = "sync-menu";
  menu.style.cssText = `position:fixed;top:${rect.bottom+6}px;right:${window.innerWidth-rect.right}px;background:#0a0a0a;border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:6px;z-index:60;box-shadow:0 12px 36px rgba(0,0,0,0.8);min-width:180px;`;
  menu.innerHTML = `
    <div style="padding:10px 14px;font-size:12px;color:#6b7280;border-bottom:1px solid rgba(255,255,255,0.06);">Synced with Google</div>
    <button type="button" id="sync-out" style="width:100%;text-align:left;padding:10px 14px;background:transparent;color:#e5e7eb;border:0;border-radius:6px;font-size:13px;font-weight:500;cursor:pointer;box-shadow:none;">Sign out</button>
  `;
  document.body.appendChild(menu);
  menu.querySelector("#sync-out").addEventListener("click", async () => {
    menu.remove();
    await window.LiftLogSync.signOut();
    showSyncBanner("Signed out. Switched to local-only mode.");
  });
  setTimeout(() => {
    document.addEventListener("click", function close(ev) {
      if (!menu.contains(ev.target)&&ev.target!==anchor) {
        menu.remove(); document.removeEventListener("click", close);
      }
    });
  }, 0);
}

function showSyncBanner(text) {
  let el = document.getElementById("sync-banner");
  if (!el) {
    el = document.createElement("div"); el.id="sync-banner";
    el.style.cssText="position:fixed;left:50%;bottom:24px;transform:translateX(-50%);max-width:520px;padding:14px 20px;background:rgba(0,0,0,0.9);border:1px solid rgba(255,255,255,0.1);border-radius:12px;color:#e5e7eb;font-size:14px;line-height:1.4;z-index:50;box-shadow:0 10px 30px rgba(0,0,0,0.6);";
    document.body.appendChild(el);
  }
  el.textContent = text;
  clearTimeout(showSyncBanner._t);
  showSyncBanner._t = setTimeout(()=>el.remove(), 5000);
}

function renderSyncBtn() {
  const btn = document.getElementById("sync-btn");
  if (!btn||!window.LiftLogSync) return;
  const s = window.LiftLogSync.state();
  btn.classList.toggle("on", s.signedIn);
  btn.classList.toggle("syncing", s.syncing);
  btn.textContent = s.syncing ? "Syncing…" : (s.signedIn ? "Synced with Google" : "Sign in with Google");
  btn.title = s.signedIn ? "Click to sign out" : "Sign in with Google";
}
if (window.LiftLogSync) {
  window.LiftLogSync.onChange(renderSyncBtn);
  renderSyncBtn();
  document.getElementById("sync-btn").addEventListener("click", async (e) => {
    const s = window.LiftLogSync.state();
    if (s.signedIn) { openSyncMenu(e.currentTarget); return; }
    const r = await window.LiftLogSync.signIn();
    if (!r.ok&&r.reason==="not-available") {
      showSyncBanner("Cloud sync is under development and coming soon. Your data is safely stored on this device.");
    }
  });
  window.addEventListener("liftlog:synced", () => {
    reloadFromStorage(); updateGlobalStats(); route();
  });
}

updateGlobalStats();
route();
