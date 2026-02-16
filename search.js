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

async function importModule(file) {
  if(moduleCache.has(file)) return moduleCache.get(file);
  try{
    const mod = await import(`./modues/${file}`);
    moduleCache.set(file, mod);
    return mod;
  } catch(err){
    console.error("Module import failed:", file, err);
    return {};
  }
}

async function runModules(user) {
  const dynamicContainer = document.getElementById("dynamicProfile");
  const localContainer = document.getElementById("localProfile");

  const mod = await importModule("OIST.js");
  if(!window.userKeywordCache[user]) window.userKeywordCache[user]={};
  const keywords = window.userKeywordCache[user];

  // --- Local profile keywords ---
  if(localContainer?.innerText){
    mod.extractKeywords(localContainer.innerText, user, keywords);
  }

  // --- GitHub keywords ---
  await mod.fetchGitHubKeywords(user);

  // --- Build unified profile ---
  mod.detectAliases(user);
  mod.buildFingerprint(user, keywords);
  mod.inferPersona(keywords, dynamicContainer);
  mod.displayFingerprint(dynamicContainer);

  // --- Display merged keywords for debug ---
  dynamicContainer.innerHTML += `<section>
    <h3>All Keywords</h3>
    <pre>${JSON.stringify(keywords,null,2)}</pre>
  </section>`;
}

btn.onclick = async () => {
  const user = input.value.trim();
  if(!user) return;

  // --- Reset ---
  result.innerHTML = `
    <h2>Search Results for: ${user}</h2>
    <div id="localProfile"></div>
    <div id="dynamicProfile"></div>
  `;
  window.userKeywordCache={};
  window.userFingerprints={};
  window.sourceConfidence={};
  window.aliasCandidates=new Set();
  window.graphNodes=[];
  window.graphLinks=[];

  // --- Load local profile ---
  try{
    const localRes = await fetch(`individual/${user}.html`);
    if(localRes.ok){
      const html = await localRes.text();
      document.getElementById("localProfile").innerHTML = html;
    }
  } catch(err){
    console.warn("Local profile load failed:", err);
  }

  // --- Run modules (local + GitHub) ---
  await runModules(user);
};
