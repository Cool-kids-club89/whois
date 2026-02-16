import { extractKeywords, scoreSource } from './display.js';

window.fingerprintProfile = window.fingerprintProfile || {};
window.sourceConfidence = window.sourceConfidence || {};

export function buildFingerprint(user = "", keywords = {}) {
  try {
    keywords = keywords || {};
    window.fingerprintProfile = {
      length: user.length || 0,
      digits: /\d/.test(user),
      symbols: /[_\-]/.test(user),
      entropy: Object.keys(keywords).length,
      sources: Object.keys(window.sourceConfidence || {})
    };
    scoreSource("Fingerprint", keywords);
  } catch (err) {
    console.error("buildFingerprint error:", err);
  }
}

export function displayFingerprint() {
  try {
    const html = `
      <section>
        <h3>Passive Fingerprint</h3>
        <pre>${JSON.stringify(window.fingerprintProfile, null, 2)}</pre>
      </section>
    `;
    const container = document.getElementById("result");
    if (container) container.innerHTML += html;
  } catch (err) {
    console.error("displayFingerprint error:", err);
  }
}

export function inferPersona(keywords = {}) {
  try {
    keywords = keywords || {};
    const tags = Object.keys(keywords);
    const persona = [];
    if (tags.some(t => ["ambient", "idm", "electronic"].includes(t)))
      persona.push("Technical / Abstract Thinker");
    if (tags.some(t => ["metal", "noise"].includes(t)))
      persona.push("High Complexity Tolerance");
    if (tags.some(t => ["pop", "charts"].includes(t)))
      persona.push("Mainstream Leaning");
    if (!persona.length) persona.push("Low Music Signal");

    const html = `
      <section>
        <h3>Persona Inference</h3>
        <ul>${persona.map(p => `<li>${p}</li>`).join("")}</ul>
      </section>
    `;
    const container = document.getElementById("result");
    if (container) container.innerHTML += html;
  } catch (err) {
    console.error("inferPersona error:", err);
  }
}
