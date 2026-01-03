export function detectAliases(user) {
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

export function displayAliases() {
  const html = `
    <section>
      <h3>Alias Candidates</h3>
      <ul>${[...window.aliasCandidates].map(a => `<li>${a}</li>`).join("")}</ul>
    </section>
  `;
  document.getElementById("result").innerHTML += html;
}
