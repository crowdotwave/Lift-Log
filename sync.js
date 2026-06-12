/* Google Drive appDataFolder sync for Lift Log.
   Data lives in a hidden folder on the user's own Drive that only this
   extension can read. We never see or store the data ourselves. */
(function () {
  const FILE_NAME = "liftlog.json";
  const STORAGE_KEY = "ironlog.v2";
  const TOMBSTONES_KEY = "liftlog.tombstones";
  const FILE_ID_KEY = "liftlog.driveFileId";
  const SIGNED_IN_KEY = "liftlog.signedIn";

  const listeners = new Set();
  let syncing = false;
  let pushTimer = null;

  function notify() { listeners.forEach(fn => { try { fn(state()); } catch {} }); }
  function state() {
    return {
      signedIn: localStorage.getItem(SIGNED_IN_KEY) === "1",
      syncing,
    };
  }

  function getToken(interactive) {
    return new Promise((resolve, reject) => {
      if (!chrome?.identity?.getAuthToken) return reject(new Error("chrome.identity unavailable"));
      chrome.identity.getAuthToken({ interactive: !!interactive }, (token) => {
        if (chrome.runtime.lastError || !token) {
          reject(new Error(chrome.runtime.lastError?.message || "no token"));
        } else resolve(token);
      });
    });
  }
  function removeToken(token) {
    return new Promise((resolve) => {
      if (!token) return resolve();
      chrome.identity.removeCachedAuthToken({ token }, () => resolve());
    });
  }

  async function authedFetch(token, url, opts = {}) {
    const res = await fetch(url, {
      ...opts,
      headers: { ...(opts.headers || {}), Authorization: "Bearer " + token },
    });
    if (res.status === 401) {
      await removeToken(token);
      throw new Error("auth-expired");
    }
    return res;
  }

  async function findFile(token) {
    const cached = localStorage.getItem(FILE_ID_KEY);
    if (cached) return cached;
    const url = "https://www.googleapis.com/drive/v3/files"
      + "?spaces=appDataFolder&fields=files(id,name)&q=" + encodeURIComponent(`name='${FILE_NAME}'`);
    const res = await authedFetch(token, url);
    if (!res.ok) throw new Error("list failed: " + res.status);
    const json = await res.json();
    const f = (json.files || [])[0];
    if (f) localStorage.setItem(FILE_ID_KEY, f.id);
    return f ? f.id : null;
  }

  async function downloadFile(token, fileId) {
    const res = await authedFetch(token,
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
    if (!res.ok) throw new Error("download failed: " + res.status);
    return res.json();
  }

  async function uploadFile(token, fileId, payload) {
    const metadata = fileId ? {} : { name: FILE_NAME, parents: ["appDataFolder"] };
    const boundary = "lftlg" + Math.random().toString(36).slice(2);
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(metadata) +
      `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
      JSON.stringify(payload) +
      `\r\n--${boundary}--`;
    const url = fileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
      : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;
    const res = await authedFetch(token, url, {
      method: fileId ? "PATCH" : "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });
    if (!res.ok) throw new Error("upload failed: " + res.status);
    const json = await res.json();
    if (json.id) localStorage.setItem(FILE_ID_KEY, json.id);
    return json;
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
  function localSessions() {
    try {
      const arr = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return Array.isArray(arr) ? arr.filter(isValidSession) : [];
    } catch { return []; }
  }
  function localTombstones() {
    try {
      const arr = JSON.parse(localStorage.getItem(TOMBSTONES_KEY));
      return Array.isArray(arr) ? arr.filter(x => typeof x === "string") : [];
    } catch { return []; }
  }
  function setLocal(sessions, tombstones) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    localStorage.setItem(TOMBSTONES_KEY, JSON.stringify(tombstones));
  }
  function addTombstone(id) {
    const t = localTombstones();
    if (!t.includes(id)) {
      t.push(id);
      localStorage.setItem(TOMBSTONES_KEY, JSON.stringify(t));
    }
  }

  function merge(localS, localT, remoteS, remoteT) {
    const tombstones = Array.from(new Set([...(localT || []), ...(remoteT || [])]));
    const tombSet = new Set(tombstones);
    const byId = new Map();
    [...(remoteS || []), ...(localS || [])].forEach(s => {
      if (!isValidSession(s) || tombSet.has(s.id)) return;
      byId.set(s.id, s);
    });
    return { sessions: [...byId.values()], tombstones };
  }

  async function syncNow(interactive) {
    if (syncing) return { ok: true };
    syncing = true; notify();
    try {
      const token = await getToken(interactive);
      localStorage.setItem(SIGNED_IN_KEY, "1");
      const fileId = await findFile(token);
      let remote = { sessions: [], tombstones: [] };
      if (fileId) {
        try {
          const got = await downloadFile(token, fileId);
          if (got && Array.isArray(got.sessions)) {
            remote.sessions = got.sessions.filter(isValidSession);
            remote.tombstones = Array.isArray(got.tombstones)
              ? got.tombstones.filter(x => typeof x === "string") : [];
          }
        } catch (e) {
          if (String(e.message).includes("404")) {
            localStorage.removeItem(FILE_ID_KEY);
          } else throw e;
        }
      }
      const merged = merge(localSessions(), localTombstones(), remote.sessions, remote.tombstones);
      setLocal(merged.sessions, merged.tombstones);
      await uploadFile(token, localStorage.getItem(FILE_ID_KEY), {
        sessions: merged.sessions,
        tombstones: merged.tombstones,
        updatedAt: new Date().toISOString(),
      });
      window.dispatchEvent(new CustomEvent("liftlog:synced"));
      syncing = false; notify();
      return { ok: true };
    } catch (e) {
      syncing = false; notify();
      if (e.message === "auth-expired") return { ok: false, reason: "auth-expired" };
      const msg = String(e.message || e);
      const blocked = /bad client id|access_denied|not approve|not granted|disallowed_useragent|admin policy|unauthorized_client|invalid_client/i.test(msg);
      if (interactive) console.warn("sync failed", e);
      return { ok: false, reason: blocked ? "not-available" : "error", message: msg };
    }
  }

  function schedulePush() {
    if (localStorage.getItem(SIGNED_IN_KEY) !== "1") return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => syncNow(false), 1500);
  }

  async function signIn() {
    const r = await syncNow(true);
    return { ...state(), ...r };
  }
  async function signOut() {
    try {
      const token = await getToken(false).catch(() => null);
      if (token) {
        await removeToken(token);
        try {
          await fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(token), { method: "POST" });
        } catch {}
      }
    } finally {
      localStorage.removeItem(SIGNED_IN_KEY);
      localStorage.removeItem(FILE_ID_KEY);
      notify();
    }
  }

  window.LiftLogSync = {
    state,
    signIn,
    signOut,
    syncNow,
    schedulePush,
    addTombstone,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };

  // Pull on load if signed in
  if (localStorage.getItem(SIGNED_IN_KEY) === "1") {
    syncNow(false);
  }
})();
