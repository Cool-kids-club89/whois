export function similarityScore(a = {}, b = {}) {
  let s = 0;
  try {
    if (!a || !b) return 0;
    if (a.length === b.length) s++;
    if (a.digits === b.digits) s++;
    if (a.symbols === b.symbols) s++;
    if (Math.abs((a.entropy || 0) - (b.entropy || 0)) < 10) s += 2;
  } catch (err) {
    console.error("similarityScore error:", err);
  }
  return s;
}

export function clusterUsers() {
  try {
    const users = Object.entries(window.userFingerprints || {});
    window.userClusters = {};
    users.forEach(([u1, f1]) => {
      window.userClusters[u1] = [];
      users.forEach(([u2, f2]) => {
        if (u1 !== u2 && similarityScore(f1, f2) >= 4)
          window.userClusters[u1].push(u2);
      });
    });
  } catch (err) {
    console.error("clusterUsers error:", err);
  }
}

export function displayClusters() {
  try {
    const clusters = window.userClusters || {};
    const html = `
      <section>
        <h3>User Clusters</h3>
        <ul>
          ${Object.entries(clusters)
            .map(([u, c]) => `<li>${u} → ${c.join(", ") || "none"}</li>`)
            .join("")}
        </ul>
      </section>
    `;
    const container = document.getElementById("result");
    if (container) container.innerHTML += html;
  } catch (err) {
    console.error("displayClusters error:", err);
  }
}

export function matchFingerprints() {
  try {
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
        </section>
      `;
      const container = document.getElementById("result");
      if (container) container.innerHTML += html;
    }
  } catch (err) {
    console.error("matchFingerprints error:", err);
  }
}
