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
function
