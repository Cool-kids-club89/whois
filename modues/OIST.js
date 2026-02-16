// OIST.js
// -------------------------
// WHOIS / OSINT All-in-One
// -------------------------

export function extractKeywords(text, user, store) {
  const blacklist = ["http","https","www",user.toLowerCase()];
  text?.toLowerCase()
    .replace(/[^a-z0-9]/g," ")
    .split(/\s+/)
    .filter(w=>w.length>3 && !blacklist.includes(w))
    .forEach(w => store[w]=(store[w]||0)+1);
}

export function detectAliases(user) {
  const b = user.toLowerCase();
  [
    b,
    b.replace(/[0-9]/g,""),
    b.replace(/[aeios]/g,c=>({a:"4",e:"3",i:"1",o:"0",s:"5"}[c]||c)),
    b+"dev",
    b+"alt",
    "_"+b
  ].forEach(a=>window.aliasCandidates.add(a));
}

export function buildFingerprint(user, keywords) {
  window.fingerprintProfile = {
    length: user.length,
    digits: /\d/.test(user),
    symbols: /[_\-]/.test(user),
    entropy: Object.keys(keywords||{}).length,
    sources: Object.keys(window.sourceConfidence||{})
  };
  window.userFingerprints[user] = window.fingerprintProfile;
}

export function displayFingerprint(container=document.getElementById("result")) {
  container.innerHTML += `<section>
    <h3>Passive Fingerprint</h3>
    <pre>${JSON.stringify(window.fingerprintProfile||{},null,2)}</pre>
  </section>`;
}

export async function showUserProfile(user, container=document.getElementById("result")) {
  container.innerHTML += `<h2>${user}</h2><p>Loading profile...</p>`;
  // For demo: simulate online fetch
  container.innerHTML += `<p>GitHub profile: <i>Simulated fetch</i></p>`;
}

export function inferPersona(keywords) {
  const persona = [];
  const tags = Object.keys(keywords||{});
  if(tags.some(t=>["ambient","idm","electronic"].includes(t))) persona.push("Technical / Abstract Thinker");
  if(tags.some(t=>["metal","noise"].includes(t))) persona.push("High Complexity Tolerance");
  if(!persona.length) persona.push("Low Music Signal");

  const html = `<section>
    <h3>Persona Inference</h3>
    <ul>${persona.map(p=>`<li>${p}</li>`).join("")}</ul>
  </section>`;
  document.getElementById("result").innerHTML += html;
}

// Minimal stubs for clustering & graphing
export function clusterUsers() {}
export function displayClusters() {}
export function buildGraph() {}
export function renderGraph() {}
