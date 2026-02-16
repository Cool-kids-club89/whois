/* =========================
   DOM REFERENCES
========================= */
const input  = document.getElementById("inputSearch");
const btn    = document.getElementById("searchBtn");
const result = document.getElementById("result");

/* =========================
   GLOBAL STATE
========================= */
window.userKeywordCache  = {};
window.userFingerprints  = {};
window.sourceConfidence  = {};
window.aliasCandidates   = new Set();

/* =========================
   INTERNAL CACHES
========================= */
const moduleCache     = new Map();
let moduleFileCache   = null;

/* =========================
   URL SEARCH AUTOLOAD
========================= */
const params = new URLSearchParams(window.location.search);
const autoSearch = params.get("search");
if (autoSearch) {
  input.value = autoSearch;
  queueMicrotask(() => btn.click());
}

/* =========================
   MAIN SEARCH HANDLER
========================= */
btn.onclick = async () => {
  const user = input.value.trim();
  if (!user) return;

  resetState();
  renderBase(user);

  // Ensure keyword cache exists
  if (!window.userKeywordCache[user]) window.userKeywordCache[user] = {};

  try {
    const modules = await loadModulesOnce();
    await runModules(modules, user);
    await fetchLocalProfile(user);
  } catch (err) {
    console.error("Search pipeline failed:", err);
  }
};

/* =========================
   RENDER BASE STRUCTURE
========================= */
function renderBase(user) {
  result.innerHTML = `
    <h2>Search Results for: ${user}</h2>
    <div id="localProfile"></div>
    <div id="dynamicProfile"></div>
  `;
}

/* =========================
   MODULE LOADING
========================= */
async function loadModulesOnce() {
  if (moduleFileCache) return moduleFileCache;

  const res = await fetch("./modules/moduleList.json");
  if (!res.ok) throw new Error("moduleList.json missing");

  const { files } = await res.json();
  moduleFileCache = files.filter(f => !f.includes("template"));
  return moduleFileCache;
}

/* =========================
   MODULE EXECUTION PIPELINE
========================= */
async function runModules(files, user) {
  const dynamicContainer = document.getElementById("dynamicProfile");

  for (const file of files) {
    try {
      const mod = await importModule(file);

      // Ensure user keyword cache exists
      if (!window.userKeywordCache[user]) window.userKeywordCache[user] = {};

      // ordered execution safely
      await safeCall(mod.loadGitHub, user, window.userKeywordCache[user]);
      await safeCall(mod.detectPrimaryBioSite, user, window.userKeywordCache[user]);
      await safeCall(mod.buildFingerprint, user, window.userKeywordCache[user]);
      await safeCall(mod.matchFingerprints);
      await safeCall(mod.inferPersona, window.userKeywordCache[user]);

      // render phase (append-only), skip non-existing functions
      await safeCall(mod.displayFingerprint, dynamicContainer);
      await safeCall(mod.displayClusters, dynamicContainer);
      // removed old `displayGraph` reference
      await safeCall(mod.showUserProfile, user, dynamicContainer);

    } catch (err) {
      console.warn(`Module failed: ${file}`, err);
    }
  }
}

/* =========================
   MODULE IMPORT (CACHED)
========================= */
async function importModule(file) {
  if (moduleCache.has(file)) return moduleCache.get(file);

  const mod = await import(`./modules/${file}`);
  moduleCache.set(file, mod);
  return mod;
}

/* =========================
   SAFE FUNCTION CALL
========================= */
async function safeCall(fn, ...args) {
  if (typeof fn === "function") {
    try {
      await fn(...args);
    } catch (e) {
      console.warn("Function execution error:", fn.name, e);
    }
  }
}

/* =========================
   LOCAL PROFILE LOADER
========================= */
async function fetchLocalProfile(user) {
  const container = document.getElementById("localProfile");

  try {
    const res = await fetch(`individual/${user}.html`);
    if (!res.ok) return;

    const html = await res.text();
    container.innerHTML = html;
  } catch (err) {
    console.warn("Local profile load failed:", err);
  }
}

/* =========================
   RESET STATE
========================= */
function resetState() {
  window.userKeywordCache  = {};
  window.userFingerprints  = {};
  window.sourceConfidence  = {};
  window.aliasCandidates.clear();
}
