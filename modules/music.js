import { extractKeywords, scoreSource } from './display.js';

export async function loadMusicOSINT(user, keywords) {
  const resultDiv = document.getElementById("result");
  resultDiv.innerHTML += `<section><h3>Music OSINT</h3><ul id="music"></ul></section>`;
  const list = document.getElementById("music");

  for (const site of ["last.fm", "libre.fm"]) {
    try {
      const url = `https://${site}/user/${user}`;
      const res = await fetch(url);
      if (res.ok) {
        const html = await res.text();
        extractKeywords(html, user, keywords);
        list.innerHTML += `<li><a href="${url}" target="_blank">${site}</a></li>`;
      }
    } catch {}
  }
  scoreSource("Music", keywords);
}
