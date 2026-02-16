/* DOM References */
const input = document.getElementById("inputSearch");
const mod = await import("./modues/OIST.js");
const btn = document.getElementById("searchBtn");
const result = document.getElementById("result");

window.userKeywordCache  = {};
window.userFingerprints  = {};
window.sourceConfidence  = {};
window.aliasCandidates   = new Set();
window.graphNodes        = [];
window.graphLinks        = [];

/* Module cache */
const moduleCache = new Map();
let moduleFileCache = null;

/* URL AutoSearch */
const params = new URLSearchParams(window.location.search);
const autoSearch = params.get("search");
if(autoSearch){ input.value = autoSearch; queueMicrotask(()=>btn.click()); }

/* Reset state */
function resetState(){
  window.userKeywordCache  = {};
  window.userFingerprints  = {};
  window.sourceConfidence  = {};
  window.aliasCandidates.clear();
  window.graphNodes        = [];
  window.graphLinks        = [];
}

/* Render base */
function renderBase(user){
  result.innerHTML = `
    <h2>Search Results for: ${user}</h2>
    <div id="localProfile"></div>
    <div id="dynamicProfile"></div>
  `;
}

/* Module loader (once) */
async function loadModulesOnce(){
  if(moduleFileCache) return moduleFileCache;
  try{
    const res = await fetch("./modues/OIST.js");
    if(!res.ok) throw new Error("OIST.js missing");
    moduleFileCache = ["OIST.js"];
    return moduleFileCache;
  }catch(err){
    console.error("Failed to load module:", err);
    return [];
  }
}

/* Module importer */
async function importModule(file){
  if(moduleCache.has(file)) return moduleCache.get(file);
  try{
    const mod = await import(`https://raw.githubusercontent.com/JamesHickers/whois/main/modues/${file}`);
    moduleCache.set(file, mod);
    return mod;
  } catch(err){
    console.error("Module import failed:", file, err);
    return {};
  }
}

/* Safe function call */
async function safeCall(fn,...args){
  if(typeof fn==="function") try{ await fn(...args); }catch(err){console.warn("Function execution error:",fn.name,err);}
}

/* Run modules (merge-aware) */
async function runModules(files,user){
  const dynamicContainer = document.getElementById("dynamicProfile");
  for(const file of files){
    try{
      const mod = await importModule(file);
      if(!window.userKeywordCache[user]) window.userKeywordCache[user] = {};

      await safeCall(mod.loadGitHub,user,window.userKeywordCache[user]);
      await safeCall(mod.detectAliases,user);
      await safeCall(mod.buildFingerprint,user,window.userKeywordCache[user]);
      await safeCall(mod.inferPersona,window.userKeywordCache[user]);
      await safeCall(mod.matchFingerprints);
      await safeCall(mod.clusterUsers);
      await safeCall(mod.displayFingerprint,dynamicContainer);
      await safeCall(mod.displayClusters,dynamicContainer);
      await safeCall(mod.displayAliases,dynamicContainer);
      await safeCall(mod.buildGraph,user);
      await safeCall(mod.renderGraph,dynamicContainer);
      await safeCall(mod.showUserProfile,user,dynamicContainer);
    }catch(err){
      console.warn(`Module execution failed: ${file}`, err);
    }
  }
}

/* =========================
   Main Button Handler
========================= */
btn.onclick = async () => {
  const user = input.value.trim();
  if(!user) return;

  resetState();
  renderBase(user);

  const localContainer = document.getElementById("localProfile");
  const dynamicContainer = document.getElementById("dynamicProfile");

  // Load local profile
  try{
    const res = await fetch(`individual/${user}.html`);
    if(res.ok){ localContainer.innerHTML = await res.text(); }
  }catch(err){ console.warn("Local profile load failed:", err); }

  // Load modules
  let modules = [];
  try{ modules = await loadModulesOnce(); }catch(err){ console.error("Module load failed:",err); }

  // Run modules (merge-aware)
  try{ await runModules(modules,user); }catch(err){ console.error("Module execution failed:",err); }

  // Unified profile display (local + online)
  try{ await OIST.showUserProfile(user,dynamicContainer); }catch(err){ console.error("Unified profile display failed:",err); }
};
