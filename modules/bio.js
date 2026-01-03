import { extractKeywords, scoreSource } from './display.js';

export async function detectPrimaryBioSite(user, keywords) {
  const sites = [
    `https://${user}.carrd.co`,
    `https://about${user}.carrd.co`,
    `https://github.com/${user}`
  ];

  const found = [];
  for (const s of sites) {
    try {
      if ((await fetch(s, { method: "HEAD" })).ok) found.push(s);
    } catch {}
  }

  if (found.length) {
    const html = `
      <section>
        <h3>Primary About Site</h3>
        <ul>${found.map((f, i) =>
          `<li>${i === 0 ? "⭐ " : ""}<a href="${f}" target="_blank">${f}</a></li>`
        ).join("")}</ul>
      </section>
    `;
    document.getElementById("result").innerHTML += html;
    found.forEach(f => extractKeywords(f, user, keywords));
  }
  scoreSource("Bio", keywords);
}
