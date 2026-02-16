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
window.graphNodes        = [];
window.graphLinks        = [];

/* =========================
   INTERNAL CACHES
========================= */
const moduleCache   = new Map();
let moduleFileCache = null;

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
   MODULE LOADING (ONCE)
========================= */
async function loadModulesOnce() {
  if (moduleFileCache) return moduleFileCache;

  try {
    const res = await fetch("./modues/OIST.js"); // single combined module
    if (!res.ok) throw new Error("OIST.js missing");

    moduleFileCache = ["OIST.js"];
    return moduleFileCache;
  } catch (err) {
    console.error("Failed to load combined module:", err);
    return [];
  }
}

/* =========================
   MODULE EXECUTION PIPELINE
========================= */
async function runModules(files, user) {
  const dynamicContainer = document.getElementById("dynamicProfile");

  for (const file of files) {
    try {
      const mod = await importModule(file);

      // Ordered execution
      await safeCall(mod.loadGitHub, user, window.userKeywordCache[user] = {});
      await safeCall(mod.detectPrimaryBioSite, user, window.userKeywordCache[user]);
      await safeCall(mod.buildFingerprint, user, window.userKeywordCache[user]);
      await safeCall(mod.matchFingerprints);
      await safeCall(mod.inferPersona, window.userKeywordCache[user]);
      await safeCall(mod.detectAliases, user);

      // Render phase
      await safeCall(mod.displayFingerprint, dynamicContainer);
      await safeCall(mod.displayClusters, dynamicContainer);
      await safeCall(mod.displayGraph, dynamicContainer);
      await safeCall(mod.displayAliases, dynamicContainer);
      await safeCall(mod.showUserProfile, user, dynamicContainer);

    } catch (err) {
      console.warn(`Module execution failed: ${file}`, err);
    }
  }
}

/* =========================
   MODULE IMPORT (CACHED)
========================= */
async function importModule(file) {
  if (moduleCache.has(file)) return moduleCache.get(file);

  try {
    const mod = await import(`./modues/${file}`);
    moduleCache.set(file, mod);
    return mod;
  } catch (err) {
    console.error("Module import failed:", file, err);
    return {};
  }
}

/* =========================
   SAFE FUNCTION CALL
========================= */
async function safeCall(fn, ...args) {
  if (typeof fn === "function") {
    try {
      await fn(...args);
    } catch (err) {
      console.warn("Function execution error:", fn.name, err);
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
  window.graphNodes        = [];
  window.graphLinks        = [];
}
