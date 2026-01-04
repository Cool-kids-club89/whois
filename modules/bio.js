export function detectPrimaryBioSite(user, keywords) {
  const sites = [
    `https://${user}.carrd.co`,
    `https://about${user}.carrd.co`,
    `https://github.com/${user}`
  ];

  const found = [];
  for (const s of sites) {
    try {
      const res = await fetch(corsProxyUrl + encodeURIComponent(s), { method: "HEAD" });
      if (res.ok) found.push(s);
    } catch (error) {
      console.warn("Error with CORS-proxied request:", error);
    }
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
    found.forEach(f => extractKeywords(f, user, keywords || {}));  // Add check for keywords
  }
  scoreSource("Bio", keywords || {});  // Add fallback for keywords
}
