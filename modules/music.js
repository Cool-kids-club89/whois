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
      let url;
      if (site === "last.fm") {
        // Construct Last.fm URL
        url = `https://www.last.fm/user/${user}`;
      } else if (site === "libre.fm") {
        // Construct Libre.fm URL
        url = `https://libre.fm/user/${user}`;
      }

      // Make the request through the CORS proxy
      const res = await fetch(`${corsProxyUrl}${encodeURIComponent(url)}`);
      
      if (res.ok) {
        const html = await res.text();
        extractKeywords(html, user, keywords);

        // Append the site link to the list
        list.innerHTML += `<li><a href="${url}" target="_blank">${site}</a></li>`;
      } else {
        console.warn(`Failed to fetch from ${site}: ${res.statusText}`);
      }
    } catch (err) {
      console.warn(`Failed to fetch from ${site}: ${err.message}`);
    }
  }

  // Score the collected keywords
  scoreSource("Music", keywords);
}
