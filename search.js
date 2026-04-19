const input = document.getElementById("inputSearch");
const btn = document.getElementById("searchBtn");
const result = document.getElementById("result");

const moduleCache = new Map();

const state = {
  keywordCache: {},
  fingerprints: {},
  confidence: {},
  aliasCandidates: new Set(),
  graphNodes: [],
  graphLinks: []
};

async function importModule(file) {
  if (moduleCache.has(file)) return moduleCache.get(file);

  try {
    const mod = await import(`./modues/${file}`);
    moduleCache.set(file, mod);
    return mod;
  } catch (err) {
    console.error("Module load failed:", file, err);
    return {};
  }
}

async function runModules(user) {
  const dynamic = document.getElementById("dynamicProfile");
  const local = document.getElementById("localProfile");

  const mod = await importModule("OIST.js");

  const keywords = state.keywordCache[user] ??= {};

  if (local?.innerText) {
    mod.extractKeywords(local.innerText, user, keywords);
  }

  await mod.fetchGitHubKeywords(user);

  mod.detectAliases(user);
  mod.buildFingerprint(user, keywords);
  mod.inferPersona(keywords, dynamic);
  mod.displayFingerprint(dynamic);

  mod.buildGraph(user);
  mod.renderGraph();

  const debug = document.createElement("section");
  debug.innerHTML = `
    <h3>All Keywords</h3>
    <pre>${JSON.stringify(keywords, null, 2)}</pre>
  `;
  dynamic.appendChild(debug);
}

btn.onclick = async () => {
  const user = input.value.trim();
  if (!user) return;

  result.innerHTML = `
    <h2>Search Results for: ${user}</h2>
    <div id="localProfile"></div>
    <div id="dynamicProfile"></div>
  `;

  // reset state cleanly
  state.keywordCache = {};
  state.fingerprints = {};
  state.confidence = {};
  state.aliasCandidates = new Set();
  state.graphNodes = [];
  state.graphLinks = [];

  try {
    const res = await fetch(`individual/${user}.html`);
    if (res.ok) {
      document.getElementById("localProfile").innerHTML = await res.text();
    }
  } catch (err) {
    console.warn("Local profile load failed:", err);
  }

  await runModules(user);
};
