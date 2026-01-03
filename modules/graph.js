export function buildGraph(user) {
  window.graphNodes.push({ id: user, group: 1 });
  window.aliasCandidates.forEach(a => {
    window.graphNodes.push({ id: a, group: 2 });
    window.graphLinks.push({ source: user, target: a, type: "alias" });
  });
  (window.userClusters[user] || []).forEach(o => {
    window.graphLinks.push({ source: user, target: o, type: "cluster" });
  });
}

export function renderGraph() {
  const svg = d3.select("#result").append("svg").attr("width", 700).attr("height", 400);

  const sim = d3.forceSimulation(window.graphNodes)
    .force("link", d3.forceLink(window.graphLinks).id(d => d.id).distance(80))
    .force("charge", d3.forceManyBody().strength(-250))
    .force("center", d3.forceCenter(350, 200));

  const link = svg.selectAll("line").data(window.graphLinks).enter().append("line")
    .attr("stroke", d => d.type === "cluster" ? "#7ee787" : "#555");

  const node = svg.selectAll("circle").data(window.graphNodes).enter().append("circle")
    .attr("r", 6)
    .attr("fill", d => d.group === 1 ? "#58a6ff" : "#f778ba")
    .call(d3.drag().on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; }));

  const label = svg.selectAll("text").data(window.graphNodes).enter().append("text")
    .text(d => d.id)
    .attr("font-size", "10px");

  sim.on("tick", () => {
    link.attr("x1", d => d.source.x).attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
    node.attr("cx", d => d.x).attr("cy", d => d.y);
    label.attr("x", d => d.x + 8).attr("y", d => d.y);
  });
}
