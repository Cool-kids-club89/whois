import { extractKeywords, scoreSource } from './display.js';

export async function loadMusicOSINT(user, keywords) {
  const resultDiv = document.getElementById("result");
  resultDiv.innerHTML += `<section><h3>Music OSINT</h3><ul id="music"></ul></section>`;
  const list = document.getElementById("music");

  // Using a proxy to bypass CORS issues
  const corsProxyUrl = 'https://api.cors.lol/?url=';

  const sites = ["last.fm", "libre.fm"];
  
  for (const site of sites) {
    try {
      const url = `https://${site}/user/${user}`;
      const res = await fetch(`${corsProxyUrl}${encodeURIComponent(url)}`);
      if (res.ok) {
        const html = await res.text();
        extractKeywords(html, user, keywords);
        list.innerHTML += `<li><a href="${url}" target="_blank">${site}</a></li>`;
      }
    } catch (err) {
      console.warn(`Failed to fetch from ${site}: ${err.message}`);
    }
  }
  
  scoreSource("Music", keywords);
}
