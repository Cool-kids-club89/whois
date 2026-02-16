// OIST.js — Unified OSINT Module with Graph
// -------------------------

// KEYWORD / ALIAS UTILS
export function extractKeywords(text, user, store){
  if(!text) return;
  const blacklist=["http","https","www",user.toLowerCase()];
  text.toLowerCase()
      .replace(/[^a-z0-9]/g," ")
      .split(/\s+/)
      .filter(w=>w.length>3 && !blacklist.includes(w))
      .forEach(w=>store[w]=(store[w]||0)+1);
}

export function detectAliases(user){
  const b=user.toLowerCase();
  [b, b.replace(/[0-9]/g,""), b.replace(/[aeios]/g,c=>({a:"4",e:"3",i:"1",o:"0",s:"5"}[c]||c)), b+"dev", b+"alt", "_"+b]
  .forEach(a=>window.aliasCandidates.add(a));
}

// FINGERPRINT / PERSONA
export function buildFingerprint(user, keywords){
  window.fingerprintProfile={
    length:user.length,
    digits:/\d/.test(user),
    symbols:/[_\-]/.test(user),
    entropy:Object.keys(keywords||{}).length,
    sources:Object.keys(window.sourceConfidence||{})
  };
  window.userFingerprints[user]=window.fingerprintProfile;
}

export function displayFingerprint(container=document.getElementById("dynamicProfile")){
  container.innerHTML+=`<section>
    <h3>Passive Fingerprint</h3>
    <pre>${JSON.stringify(window.fingerprintProfile||{},null,2)}</pre>
  </section>`;
}

export function inferPersona(keywords, container=document.getElementById("dynamicProfile")){
  const tags=Object.keys(keywords||{});
  const persona=[];
  if(tags.some(t=>["ambient","idm","electronic"].includes(t))) persona.push("Technical / Abstract Thinker");
  if(tags.some(t=>["metal","noise"].includes(t))) persona.push("High Complexity Tolerance");
  if(tags.some(t=>["pop","charts"].includes(t))) persona.push("Mainstream Leaning");
  if(!persona.length) persona.push("Low Music Signal");

  container.innerHTML+=`<section>
    <h3>Persona Inference</h3>
    <ul>${persona.map(p=>`<li>${p}</li>`).join("")}</ul>
  </section>`;
}

// GITHUB FETCH
export async function fetchGitHubKeywords(user){
  const keywords=window.userKeywordCache[user]||{};
  try{
    const profileRes=await fetch(`https://api.github.com/users/${user}`);
    if(profileRes.ok){
      const profile=await profileRes.json();
      extractKeywords(profile.bio||"",user,keywords);

      const reposRes=await fetch(`https://api.github.com/users/${user}/repos`);
      if(reposRes.ok){
        const repos=await reposRes.json();
        repos.forEach(r=>{
          extractKeywords(r.name,user,keywords);
          extractKeywords(r.description,user,keywords);
        });
      }

      const orgsRes=await fetch(`https://api.github.com/users/${user}/orgs`);
      if(orgsRes.ok){
        const orgs=await orgsRes.json();
        orgs.forEach(o=>extractKeywords(o.login,user,keywords));
      }
    }
  } catch(err){
    console.warn("GitHub fetch failed:",err);
  }
  return keywords;
}

// GRAPH / CLUSTER
export function buildGraph(user){
  window.graphNodes.push({id:user,group:1});
  window.aliasCandidates.forEach(a=>{
    window.graphNodes.push({id:a,group:2});
    window.graphLinks.push({source:user,target:a,type:"alias"});
  });
  (window.userClusters[user]||[]).forEach(o=>{
    window.graphLinks.push({source:user,target:o,type:"cluster"});
  });
}

export function renderGraph(){
  const svg=d3.select("#dynamicProfile").append("svg").attr("width",700).attr("height",400);
  const sim=d3.forceSimulation(window.graphNodes)
      .force("link",d3.forceLink(window.graphLinks).id(d=>d.id).distance(80))
      .force("charge",d3.forceManyBody().strength(-250))
      .force("center",d3.forceCenter(350,200));

  const link=svg.selectAll("line").data(window.graphLinks).enter().append("line")
    .attr("stroke",d=>d.type==="cluster"?"#7ee787":"#555");

  const node=svg.selectAll("circle").data(window.graphNodes).enter().append("circle")
    .attr("r",6)
    .attr("fill",d=>d.group===1?"#58a6ff":"#f778ba")
    .call(d3.drag().on("drag",(e,d)=>{d.fx=e.x;d.fy=e.y;}));

  const label=svg.selectAll("text").data(window.graphNodes).enter().append("text")
    .text(d=>d.id).attr("font-size","10px");

  sim.on("tick",()=>{
    link.attr("x1",d=>d.source.x).attr("y1",d=>d.source.y)
        .attr("x2",d=>d.target.x).attr("y2",d=>d.target.y);
    node.attr("cx",d=>d.x).attr("cy",d=>d.y);
    label.attr("x",d=>d.x+8).attr("y",d=>d.y);
  });
}
