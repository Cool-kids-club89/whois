export function similarityScore(a, b) {
  let s = 0;
  if (a.length === b.length) s++;
  if (a.digits === b.digits) s++;
  if (a.symbols === b.symbols) s++;
  if (Math.abs(a.entropy - b.entropy) < 10) s += 2;
  return s;
}

export function clusterUsers() {
  const users = Object.entries(window.userFingerprints);
  window.userClusters = {};
  users.forEach(([u1, f1]) => {
    window.userClusters[u1] = [];
    users.forEach(([u2, f2]) => {
      if (u1 !== u2 && similarityScore(f1, f2) >= 4)
        window.userClusters[u1].push(u2);
    });
  });
}

export function displayClusters() {
  const html = `
    <section>
      <h3>User Clusters</h3>
      <ul>
        ${Object.entries(window.userClusters)
          .map(([u, c]) => `<li>${u} → ${c.join(", ") || "none"}</li>`).join("")}
      </ul>
    </section>
  `;
  document.getElementById("result").innerHTML += html;
}

export function matchFingerprints() {
  const users = Object.entries(window.userFingerprints);
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
    document.getElementById("result").innerHTML += html;
  }
}
