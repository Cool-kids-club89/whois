import { extractKeywords, scoreSource } from './display.js';

export function buildFingerprint(user, keywords) {
  window.fingerprintProfile = {
    length: user.length,
    digits: /\d/.test(user),
    symbols: /[_\-]/.test(user),
    entropy: Object.keys(keywords).length,
    sources: Object.keys(window.sourceConfidence)
  };
  scoreSource("Fingerprint", keywords);
}

export function displayFingerprint() {
  const html = `
    <section>
      <h3>Passive Fingerprint</h3>
      <pre>${JSON.stringify(window.fingerprintProfile, null, 2)}</pre>
    </section>
  `;
  document.getElementById("result").innerHTML += html;
}

export function inferPersona(keywords) {
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
  document.getElementById("result").innerHTML += html;
}
