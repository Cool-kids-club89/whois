// =========================
// WHOIS / OSINT All-in-One
// =========================

// GLOBAL STATE
window.userFingerprints = window.userFingerprints || {};
window.sourceConfidence = window.sourceConfidence || {};
window.aliasCandidates = window.aliasCandidates || new Set();
window.userClusters = window.userClusters || {};
window.graphNodes = window.graphNodes || [];
window.graphLinks = window.graphLinks || [];

// -------------------------
// UTILITY FUNCTIONS
// -------------------------
function extractKeywords(text, user, store) {
  const blacklist = ["http", "https", "www", user.toLowerCase()];
  text?.toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 3 && !blacklist.includes(w))
    .forEach(w => store[w] = (store[w] || 0) + 1);
}

function scoreSource(name, keywords) {
  window.sourceConfidence[name] = {
    score: Math.min(100, Object.keys(keywords || {}).length * 2),
    ts: Date.now()
  };
}

function applyDecay() {
  const now = Date.now();
  Object.values(window.sourceConfidence).forEach(s => {
    const ageDays = (now - s.ts) / 86400000;
    s.score = Math.max(0, (s.score * Math.exp(-0.15 * ageDays))).toFixed(2);
  });
}

function displaySourceConfidence() {
  const html = `
    <section>
      <h3>Source Confidence</h3>
      <ul>${Object.entries(window.sourceConfidence)
        .map(([s, v]) => `<li>${s}: ${v.score}%</li>`).join("")}</ul>
    </section>`;
  document.getElementById("result").innerHTML += html;
}

function displayKeywordConfidence(k) {
  const total = Object.values(k || {}).reduce((a, b) => a + b, 0) || 1;
  const top = Object.entries(k || {}).sort((a, b) => b[1] - a[1]).slice(0, 30);
  const html = `
    <section>
      <h3>Keyword Confidence</h3>
      <ul>${top.map(([w, v]) => `<li>${w} ${(v / total * 100).toFixed(2)}%</li>`).join("")}</ul>
    </section>`;
  document.getElementById("result").innerHTML += html;
}

// -------------------------
// ALIAS FUNCTIONS
// -------------------------
function detectAliases(user) {
  const b = user.toLowerCase();
  [
    b,
    b.replace(/[0-9]/g, ""),
    b.replace(/[aeios]/g, c => ({ a: "4", e: "3", i: "1", o: "0", s: "5" }[c] || c)),
    b + "dev",
    b + "alt",
    "_" + b
  ].forEach(a => window.aliasCandidates.add(a));
}

function displayAliases() {
  const html = `
    <section>
      <h3>Alias Candidates</h3>
      <ul>${[...window.aliasCandidates].map(a => `<li>${a}</li>`).join("")}</ul>
    </section>`;
  document.getElementById("result").innerHTML += html;
}

// -------------------------
// FINGERPRINT / PERSONA
// -------------------------
function buildFingerprint(user, keywords) {
  window.fingerprintProfile = {
    length: user.length,
    digits: /\d/.test(user),
    symbols: /[_\-]/.test(user),
    entropy: Object.keys(keywords || {}).length,
    sources: Object.keys(window.sourceConfidence || {})
  };
  window.userFingerprints[user] = window.fingerprintProfile;
  scoreSource("Fingerprint", keywords);
}

function displayFingerprint() {
  const html = `
    <section>
      <h3>Passive Fingerprint</h3>
      <pre>${JSON.stringify(window.fingerprintProfile || {}, null, 2)}</pre>
    </section>`;
  document.getElementById("result").innerHTML += html;
}

function inferPersona(keywords) {
  const tags = Object.keys(keywords || {});
  const persona = [];
  if (tags.some(t => ["ambient", "idm", "electronic"].includes(t))) persona.push("Technical / Abstract Thinker");
  if (tags.some(t => ["metal", "noise"].includes(t))) persona.push("High Complexity Tolerance");
  if (tags.some(t => ["pop", "charts"].includes(t))) persona.push("Mainstream Leaning");
  if (!persona.length) persona.push("Low Music Signal");

  const html = `
    <section>
      <h3>Persona Inference</h3>
      <ul>${persona.map(p => `<li>${p}</li>`).join("")}</ul>
    </section>`;
  document.getElementById("result").innerHTML += html;
}

// -------------------------
// CLUSTERING
// -------------------------
function similarityScore(a, b) {
  let s = 0;
  if (!a || !b) return s;
  if (a.length === b.length) s++;
  if (a.digits === b.digits) s++;
  if (a.symbols === b.symbols) s++;
  if (Math.abs(a.entropy - b.entropy) < 10) s += 2;
  return s;
}

function clusterUsers() {
  const users = Object.entries(window.userFingerprints || {});
  window.userClusters = {};
  users.forEach(([u1, f1]) => {
    window.userClusters[u1] = [];
    users.forEach(([u2, f2]) => {
      if (u1 !== u2 && similarityScore(f1, f2) >= 4) window.userClusters[u1].push(u2);
    });
  });
}

function displayClusters() {
  const html = `
    <section>
      <h3>User Clusters</h3>
      <ul>${Object.entries(window.userClusters || {}).map(([u, c]) =>
        `<li>${u} → ${c.join(", ") || "none"}</li>`).join("")}</ul>
    </section>`;
  document.getElementById("result").innerHTML += html;
}

function matchFingerprints() {
  const users = Object.entries(window.userFingerprints || {});
  const matches = [];
  for (let i = 0; i < users.length; i++) {
    for (let j = i + 1; j < users.length; j++) {
      const [u1, f1] = users[i];
      const [u2, f2] = users[j];
      const score = similarityScore(f1, f2);
      if (score >= 5) matches.push({ u1, u2, score });
    }
  }
  if (matches.length) {
    const html = `
      <section>
        <h3>Fingerprint Matches</h3>
        <ul>${matches.map(m => `<li>${m.u1} ↔ ${m.u2} (score ${m.score})</li>`).join("")}</ul>
      </section>`;
    document.getElementById("result").innerHTML += html;
  }
}

// -------------------------
// GRAPHING (D3)
// -------------------------
function buildGraph(user) {
  window.graphNodes.push({ id: user, group: 1 });
  window.aliasCandidates.forEach(a => {
    window.graphNodes.push({ id: a, group: 2 });
    window.graphLinks.push({ source: user, target: a, type: "alias" });
  });
  (window.userClusters[user] || []).forEach(o => {
    window.graphLinks.push({ source: user, target: o, type: "cluster" });
  });
}

function renderGraph() {
  const svg = d3.select("#result").append("svg").attr("width", 700).attr("height", 400);

  const sim = d3.forceSimulation(window.graphNodes)
    .force("link", d3.forceLink(window.graphLinks).id(d => d.id).distance(80))
    .force("charge", d3.forceManyBody().strength(-250))
    .force("center", d3.forceCenter(350, 200));

  const link = svg.selectAll("line").data(window.graphLinks).enter().append("line")
    .attr("stroke", d => d.type === "cluster" ? "#7ee787" : "#555");

  const node = svg.selectAll("circle").data(window.graphNodes).enter().append("circle")
    .attr("r", 6)
    .attr("fill", d => d.group === 1 ? "#58a6ff" : "#f778ba")
    .call(d3.drag().on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; }));

  const label = svg.selectAll("text").data(window.graphNodes).enter().append("text")
    .text(d => d.id)
    .attr("font-size", "10px");

  sim.on("tick", () => {
    link.attr("x1", d => d.source.x).attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
    node.attr("cx", d => d.x).attr("cy", d => d.y);
    label.attr("x", d => d.x + 8).attr("y", d => d.y);
  });
}

// -------------------------
// GITHUB PROFILE (SAFE)
// -------------------------
async function showUserProfile(username, container) {
  container.innerHTML = `<h2>${username}</h2><p>Loading profile...</p>`;
  const keywords = {};

  try {
    const profileRes = await fetch(`https://api.github.com/users/${username}`);
    const profile = await profileRes.json();
    extractKeywords(profile.bio || "", username, keywords);

    const reposRes = await fetch(`https://api.github.com/users/${username}/repos`);
    const repos = await reposRes.json();
    repos.forEach(r => { extractKeywords(r.name, username, keywords); extractKeywords(r.description, username, keywords); });

    const orgsRes = await fetch(`https://api.github.com/users/${username}/orgs`);
    const orgs = await orgsRes.json();
    orgs.forEach(o => extractKeywords(o.login, username, keywords));

    // Render
    container.innerHTML += `<h3>GitHub Profile</h3>
      <p>Bio: ${profile.bio || "No bio"}</p>
      <p>Public Repos: ${profile.public_repos}</p>
      <h4>Repositories</h4>
      <ul>${repos.map(r => `<li><a href="${r.html_url}" target="_blank">${r.name}</a> (${r.language || "N/A"})</li>`).join("")}</ul>
      <h4>Organizations</h4>
      <ul>${orgs.map(o => `<li>${o.login}</li>`).join("") || "<li>None</li>"}</ul>`;

    // Fingerprint + alias
    detectAliases(username);
    buildFingerprint(username, keywords);
    inferPersona(keywords);
    displayFingerprint();
    displayAliases();

    // Clustering + graph
    clusterUsers();
    displayClusters();
    buildGraph(username);
    renderGraph();

    // Keyword / Source scoring
    displayKeywordConfidence(keywords);
    scoreSource("GitHub", keywords);
    displaySourceConfidence();
  } catch (err) {
    console.error("Error fetching GitHub profile:", err);
  }
}

// -------------------------
// EXPORTS FOR GLOBAL USE
// -------------------------
window.showUserProfile = showUserProfile;
window.buildFingerprint = buildFingerprint;
window.displayFingerprint = displayFingerprint;
window.inferPersona = inferPersona;
window.detectAliases = detectAliases;
window.displayAliases = displayAliases;
window.clusterUsers = clusterUsers;
window.displayClusters = displayClusters;
window.matchFingerprints = matchFingerprints;
window.buildGraph = buildGraph;
window.renderGraph = renderGraph;
window.extractKeywords = extractKeywords;
window.scoreSource = scoreSource;
window.applyDecay = applyDecay;
window.displaySourceConfidence = displaySourceConfidence;
window.displayKeywordConfidence = displayKeywordConfidence;
