// search.js

const input = document.getElementById("inputSearch");
const btn = document.getElementById("searchBtn");
const result = document.getElementById("result");

window.userKeywordCache = {};
window.userFingerprints = {};
window.sourceConfidence = {};
window.aliasCandidates = new Set();
window.graphNodes = [];
window.graphLinks = [];
const moduleCache = new Map();
let moduleFileCache = null;

async function importModule(file) {
  if(moduleCache.has(file)) return moduleCache.get(file);
  try {
    const mod = await import(`./modues/${file}`);
    moduleCache.set(file, mod);
    return mod;
  } catch(err) {
    console.error("Module import failed:", file, err);
    return {};
  }
}

async function runModules(files, user) {
  const dynamicContainer = document.getElementById("result");
  for(const file of files) {
    const mod = await importModule(file);
    if(!window.userKeywordCache[user]) window.userKeywordCache[user]={};

    await safeCall(mod.extractKeywords, "demo text", user, window.userKeywordCache[user]);
    await safeCall(mod.detectAliases, user);
    await safeCall(mod.buildFingerprint, user, window.userKeywordCache[user]);
    await safeCall(mod.inferPersona, window.userKeywordCache[user]);
    await safeCall(mod.displayFingerprint, dynamicContainer);
    await safeCall(mod.showUserProfile, user, dynamicContainer);
  }
}

async function safeCall(fn, ...args){
  if(typeof fn==="function") try { await fn(...args); } catch(e){console.warn(e);}
}

btn.onclick = async ()=>{
  const user = input.value.trim();
  if(!user) return;

  result.innerHTML="";
  window.userKeywordCache={};
  window.userFingerprints={};
  window.sourceConfidence={};
  window.aliasCandidates=new Set();
  window.graphNodes=[];
  window.graphLinks=[];

  const modules = ["OIST.js"];
  await runModules(modules, user);
};
