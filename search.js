/* =========================
   Search Handler (search.js)
========================= */

import * as OIST from "./OIST.js";

/* DOM References */
const input = document.getElementById("inputSearch");
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
if(autoSearch){ input.value=autoSearch; queueMicrotask(()=>btn.click()); }

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
    const mod = await import(`./modues/${file}`);
    moduleCache.set(file, mod);
    return mod;
  }catch(err){
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
      if(!window.userKeywordCache[user]) window.userKeywordCache[user]={};

      await safeCall(mod.loadGitHub,user,window.userKeywordCache[user]);
      await safeCall(mod.detectAliases,user);
      await safeCall(mod.buildFingerprint,user,window.userKeywordCache[user]);
      await safeCall(mod.inferPersona,window.userKeywordCache[user]);
      await safeCall(mod.matchFingerprints);
      await safeCall(mod.clusterUsers);
      await safeCall(mod.displayFingerprint,dynamicContainer);
      await safeCall(mod.displayClusters,dynamicContainer)
