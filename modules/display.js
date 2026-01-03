/* =========================
   DISPLAY & UTILITIES
========================= */
export function extractKeywords(text, user, store) {
  const blacklist = ["http", "https", "www", user.toLowerCase()];
  text.toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 3 && !blacklist.includes(w))
    .forEach(w => store[w] = (store[w] || 0) + 1);
}

export function scoreSource(name, keywords) {
  window.sourceConfidence[name] = {
    score: Math.min(100, Object.keys(keywords).length * 2),
    ts: Date.now()
  };
}

export function applyDecay() {
  const now = Date.now();
  Object.values(window.sourceConfidence).forEach(s => {
    const ageDays = (now - s.ts) / 86400000;
    s.score = Math.max(0, (s.score * Math.exp(-0.15 * ageDays))).toFixed(2);
  });
}

export function displaySourceConfidence() {
  const html = `
    <section>
      <h3>Source Confidence</h3>
      <ul>
        ${Object.entries(window.sourceConfidence)
          .map(([s, v]) => `<li>${s}: ${v.score}%</li>`).join("")}
      </ul>
    </section>
  `;
  document.getElementById("result").innerHTML += html;
}

export function displayKeywordConfidence(k) {
  const total = Object.values(k).reduce((a, b) => a + b, 0);
  const top = Object.entries(k).sort((a, b) => b[1] - a[1]).slice(0, 30);
  const html = `
    <section>
      <h3>Keyword Confidence</h3>
      <ul>
        ${top.map(([w, v]) => `<li>${w} ${(v / total * 100).toFixed(2)}%</li>`).join("")}
      </ul>
    </section>
  `;
  document.getElementById("result").innerHTML += html;
}
