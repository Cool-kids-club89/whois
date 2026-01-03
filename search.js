import { loadGitHub } from './modules/github.js';
import { loadMusicOSINT } from './modules/music.js';
import { detectPrimaryBioSite } from './modules/bio.js';
import { detectAliases, displayAliases } from './modules/aliases.js';
import { buildFingerprint, displayFingerprint, inferPersona } from './modules/fingerprint.js';
import { clusterUsers, displayClusters, matchFingerprints } from './modules/clustering.js';
import { buildGraph, renderGraph } from './modules/graph.js';
import { extractKeywords, displayKeywordConfidence, scoreSource, applyDecay, displaySourceConfidence } from './modules/display.js';

/* =========================
   GLOBAL STATE
========================= */
const input = document.getElementById("usernameInput");
const btn = document.getElementById("searchBtn");
const result = document.getElementById("result");

window.userKeywordCache = {};
window.userFingerprints = {};
window.userClusters = {};
window.sourceConfidence = {};
window.aliasCandidates = new Set();
window.graphNodes = [];
window.graphLinks = [];

/* =========================
   MAIN ENTRY
========================= */
btn.onclick = async () => {
  const user = input.value.trim();
  if (!user) return;

  resetState();
  result.innerHTML = `<h2>OSINT REPORT: ${user}</h2>`;
  const keywords = {};

  detectAliases(user);

  await loadGitHub(user, keywords);
  await loadMusicOSINT(user, keywords);
  await detectPrimaryBioSite(user, keywords);

  buildFingerprint(user, keywords);
  inferPersona(keywords);

  window.userKeywordCache[user] = keywords;
  window.userFingerprints[user] = window.fingerprintProfile;

  clusterUsers();
  matchFingerprints();
  applyDecay();

  displayAliases();
  displayKeywordConfidence(keywords);
  displaySourceConfidence();
  displayClusters();
  displayFingerprint();

  buildGraph(user);
  renderGraph();
};

/* =========================
   RESET
========================= */
function resetState() {
  window.sourceConfidence = {};
  window.aliasCandidates.clear();
  window.graphNodes = [];
  window.graphLinks = [];
}

/* =========================
   EXPORT
========================= */
window.exportJSON = function() {
  const blob = new Blob([JSON.stringify({
    fingerprints: window.userFingerprints,
    clusters: window.userClusters,
    confidence: window.sourceConfidence,
    aliases: [...window.aliasCandidates]
  }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "osint-report.json";
  a.click();
}

window.exportHTML = function() {
  const w = window.open("");
  w.document.write(`<html><body>${result.innerHTML}</body></html>`);
  w.document.close();
  w.print();
}
