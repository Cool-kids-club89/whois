// OIST.js
// Unified OSINT Analysis Module
// ------------------------------------------------------------
// Design goals:
//   - No global mutable analysis state
//   - Safe DOM rendering
//   - Deterministic keyword extraction
//   - Bounded GitHub collection
//   - Pagination support
//   - AbortController support
//   - GitHub rate-limit awareness
//   - Deduplicated graph construction
//   - Evidence-oriented inference instead of pretending
//     weak signals are facts
// ------------------------------------------------------------

"use strict";


// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = Object.freeze({
  githubApi: "https://api.github.com",

  githubTimeout: 10_000,
  githubMaxPages: 5,
  githubPerPage: 100,

  /*
   * Prevent enormous profiles from consuming excessive memory.
   */
  maxKeywords: 2_000,
  maxKeywordTextLength: 50_000,

  maxAliases: 100,
  maxGraphNodes: 500,
  maxGraphLinks: 1_000,

  /*
   * Very short/common words produce terrible OSINT signals.
   */
  minimumKeywordLength: 4,

  /*
   * Generic words which are usually useless for fingerprinting.
   */
  keywordBlacklist: new Set([
    "about",
    "after",
    "again",
    "also",
    "because",
    "being",
    "could",
    "from",
    "github",
    "have",
    "into",
    "more",
    "other",
    "over",
    "that",
    "their",
    "there",
    "these",
    "they",
    "this",
    "using",
    "user",
    "users",
    "which",
    "with",
    "would",

    "http",
    "https",
    "www",
    "com",
    "org",
    "net"
  ])
});


// ============================================================
// INTERNAL UTILITIES
// ============================================================

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}


function normalizeUsername(user) {
  return normalize(user);
}


function throwIfAborted(signal) {
  if (signal?.aborted) {
    const error = new Error("Operation aborted.");
    error.name = "AbortError";
    throw error;
  }
}


function withTimeout(promise, timeout, signal) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;

      settled = true;
      reject(
        new Error(`Operation timed out after ${timeout}ms.`)
      );
    }, timeout);

    const abortHandler = () => {
      if (settled) return;

      settled = true;
      clearTimeout(timer);

      const error = new Error("Operation aborted.");
      error.name = "AbortError";

      reject(error);
    };

    signal?.addEventListener(
      "abort",
      abortHandler,
      { once: true }
    );

    promise.then(
      value => {
        if (settled) return;

        settled = true;
        clearTimeout(timer);

        signal?.removeEventListener(
          "abort",
          abortHandler
        );

        resolve(value);
      },

      error => {
        if (settled) return;

        settled = true;
        clearTimeout(timer);

        signal?.removeEventListener(
          "abort",
          abortHandler
        );

        reject(error);
      }
    );
  });
}


function safeCreateElement(tag, text = "") {
  const element = document.createElement(tag);

  if (text !== undefined) {
    element.textContent = String(text);
  }

  return element;
}


function ensureKeywordStore(store) {
  if (
    !store ||
    typeof store !== "object" ||
    Array.isArray(store)
  ) {
    throw new TypeError(
      "Keyword store must be an object."
    );
  }

  return store;
}


// ============================================================
// KEYWORD EXTRACTION
// ============================================================

const TOKEN_REGEX = /[a-zA-Z0-9][a-zA-Z0-9._+-]*/g;


export function extractKeywords(
  text,
  user,
  store
) {
  ensureKeywordStore(store);

  if (!text) {
    return store;
  }

  const username =
    normalizeUsername(user);

  /*
   * Prevent pathological input sizes.
   */
  const source =
    String(text)
      .slice(0, CONFIG.maxKeywordTextLength)
      .toLowerCase();

  const tokens =
    source.match(TOKEN_REGEX) || [];

  for (const rawToken of tokens) {

    const token =
      rawToken
        .replace(/^[._+-]+|[._+-]+$/g, "");

    if (
      token.length <
      CONFIG.minimumKeywordLength
    ) {
      continue;
    }

    if (
      token === username ||
      token.includes("http") ||
      CONFIG.keywordBlacklist.has(token)
    ) {
      continue;
    }

    /*
     * Ignore obvious URL fragments.
     */
    if (
      token.startsWith("www.") ||
      token.includes("://")
    ) {
      continue;
    }

    /*
     * Bound the store.
     */
    if (
      !Object.prototype.hasOwnProperty.call(
        store,
        token
      ) &&
      Object.keys(store).length >=
        CONFIG.maxKeywords
    ) {
      break;
    }

    store[token] =
      (store[token] || 0) + 1;
  }

  return store;
}


// ============================================================
// ALIAS DETECTION
// ============================================================

function leetspeak(value) {
  return value.replace(
    /[aeios]/g,
    character => ({
      a: "4",
      e: "3",
      i: "1",
      o: "0",
      s: "5"
    }[character] ?? character)
  );
}


export function detectAliases(
  user,
  aliasStore = null
) {
  const base =
    normalizeUsername(user);

  if (!base) {
    return [];
  }

  const aliases = new Set();

  const add = alias => {
    if (
      alias &&
      aliases.size < CONFIG.maxAliases
    ) {
      aliases.add(alias);
    }
  };

  add(base);

  /*
   * Numeric-stripped form.
   */
  add(
    base.replace(/[0-9]/g, "")
  );

  /*
   * Common leetspeak representation.
   */
  add(leetspeak(base));

  /*
   * Common developer suffixes.
   */
  add(`${base}dev`);
  add(`${base}_dev`);
  add(`${base}developer`);

  /*
   * Common alternate-account patterns.
   */
  add(`${base}alt`);
  add(`${base}_alt`);

  /*
   * Legacy underscore form.
   */
  add(`_${base}`);

  /*
   * Keep compatibility with an externally supplied Set.
   */
  if (aliasStore instanceof Set) {
    for (const alias of aliases) {
      if (
        aliasStore.size >=
        CONFIG.maxAliases
      ) {
        break;
      }

      aliasStore.add(alias);
    }
  }

  return [...aliases];
}


// ============================================================
// FINGERPRINTING
// ============================================================

export function buildFingerprint(
  user,
  keywords = {},
  context = {}
) {
  const username =
    String(user ?? "");

  const keywordEntries =
    Object.entries(keywords || {});

  const sortedKeywords =
    keywordEntries
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25)
      .map(([keyword, count]) => ({
        keyword,
        count
      }));

  const fingerprint = {
    usernameLength: username.length,

    hasDigits: /\d/.test(username),

    hasUnderscore:
      username.includes("_"),

    hasHyphen:
      username.includes("-"),

    hasDot:
      username.includes("."),

    hasUppercase:
      /[A-Z]/.test(username),

    hasSymbols:
      /[^a-zA-Z0-9._-]/.test(username),

    keywordCount:
      keywordEntries.length,

    keywordEntropy:
      calculateKeywordEntropy(
        keywords
      ),

    topKeywords:
      sortedKeywords,

    sourceCount:
      Array.isArray(context.sources)
        ? context.sources.length
        : 0,

    generatedAt:
      new Date().toISOString()
  };

  /*
   * Store this in the session context rather than window.
   */
  context.fingerprint =
    fingerprint;

  return fingerprint;
}


function calculateKeywordEntropy(
  keywords
) {
  const values =
    Object.values(keywords || {})
      .filter(
        value =>
          Number.isFinite(value) &&
          value > 0
      );

  if (!values.length) {
    return 0;
  }

  const total =
    values.reduce(
      (sum, value) => sum + value,
      0
    );

  let entropy = 0;

  for (const value of values) {
    const probability =
      value / total;

    entropy -=
      probability *
      Math.log2(probability);
  }

  return Number(
    entropy.toFixed(3)
  );
}


// ============================================================
// FINGERPRINT RENDERING
// ============================================================

export function displayFingerprint(
  container,
  fingerprint = null
) {
  if (!container) {
    return;
  }

  const data =
    fingerprint ||
    container.__oistFingerprint ||
    {};

  const section =
    safeCreateElement("section");

  const heading =
    safeCreateElement(
      "h3",
      "Passive Fingerprint"
    );

  section.appendChild(heading);

  const list =
    safeCreateElement("ul");

  const entries = [
    [
      "Username length",
      data.usernameLength
    ],
    [
      "Contains digits",
      data.hasDigits
    ],
    [
      "Contains underscore",
      data.hasUnderscore
    ],
    [
      "Contains hyphen",
      data.hasHyphen
    ],
    [
      "Contains dot",
      data.hasDot
    ],
    [
      "Contains uppercase",
      data.hasUppercase
    ],
    [
      "Keyword count",
      data.keywordCount
    ],
    [
      "Keyword entropy",
      data.keywordEntropy
    ],
    [
      "Sources",
      data.sourceCount
    ]
  ];

  for (const [label, value] of entries) {
    const item =
      safeCreateElement("li");

    item.append(
      safeCreateElement(
        "strong",
        `${label}: `
      ),
      safeCreateElement(
        "span",
        String(value)
      )
    );

    list.appendChild(item);
  }

  section.appendChild(list);

  if (Array.isArray(data.topKeywords)) {

    const keywordHeading =
      safeCreateElement(
        "h4",
        "Top Keywords"
      );

    section.appendChild(
      keywordHeading
    );

    const keywordList =
      safeCreateElement("ul");

    for (
      const {
        keyword,
        count
      } of data.topKeywords
    ) {

      const item =
        safeCreateElement("li");

      item.textContent =
        `${keyword} (${count})`;

      keywordList.appendChild(item);
    }

    section.appendChild(
      keywordList
    );
  }

  container.appendChild(section);

  /*
   * Compatibility for callers that don't
   * explicitly pass the fingerprint.
   */
  container.__oistFingerprint =
    data;
}


// ============================================================
// PERSONA / SIGNAL INFERENCE
// ============================================================

const SIGNAL_GROUPS = Object.freeze({
  technicalAbstract: new Set([
    "ambient",
    "idm",
    "electronic",
    "synth",
    "experimental"
  ]),

  complexityTolerance: new Set([
    "metal",
    "noise",
    "industrial",
    "experimental"
  ]),

  mainstreamMusic: new Set([
    "pop",
    "charts",
    "mainstream"
  ])
});


function keywordMatches(
  keywords,
  vocabulary
) {
  return Object.keys(
    keywords || {}
  ).filter(
    keyword =>
      vocabulary.has(
        normalize(keyword)
      )
  );
}


export function inferPersona(
  keywords,
  container
) {
  const signals = [];

  const technical =
    keywordMatches(
      keywords,
      SIGNAL_GROUPS.technicalAbstract
    );

  const complexity =
    keywordMatches(
      keywords,
      SIGNAL_GROUPS.complexityTolerance
    );

  const mainstream =
    keywordMatches(
      keywords,
      SIGNAL_GROUPS.mainstreamMusic
    );

  if (technical.length) {
    signals.push({
      label:
        "Technical / Abstract Content Signal",
      evidence:
        technical
    });
  }

  if (complexity.length) {
    signals.push({
      label:
        "High-Complexity Content Signal",
      evidence:
        complexity
    });
  }

  if (mainstream.length) {
    signals.push({
      label:
        "Mainstream Music Content Signal",
      evidence:
        mainstream
    });
  }

  if (!signals.length) {
    signals.push({
      label:
        "Insufficient Content Signal",
      evidence: []
    });
  }

  if (container) {

    const section =
      safeCreateElement("section");

    section.appendChild(
      safeCreateElement(
        "h3",
        "Content Signal Analysis"
      )
    );

    const list =
      safeCreateElement("ul");

    for (const signal of signals) {

      const item =
        safeCreateElement("li");

      const label =
        safeCreateElement(
          "strong",
          signal.label
        );

      item.appendChild(label);

      if (signal.evidence.length) {
        item.appendChild(
          safeCreateElement(
            "span",
            ` — evidence: ${signal.evidence.join(", ")}`
          )
        );
      }

      list.appendChild(item);
    }

    section.appendChild(list);

    const note =
      safeCreateElement(
        "p",
        "These are content-derived signals, not psychological diagnoses or definitive personality classifications."
      );

    section.appendChild(note);

    container.appendChild(section);
  }

  return signals;
}


// ============================================================
// GITHUB API
// ============================================================

async function githubFetch(
  path,
  {
    signal
  } = {}
) {

  throwIfAborted(signal);

  const controller =
    new AbortController();

  const abortHandler = () =>
    controller.abort();

  signal?.addEventListener(
    "abort",
    abortHandler,
    { once: true }
  );

  try {

    const request =
      fetch(
        `${CONFIG.githubApi}${path}`,
        {
          method: "GET",

          headers: {
            "Accept":
              "application/vnd.github+json",

            "X-GitHub-Api-Version":
              "2022-11-28"
          },

          signal:
            controller.signal
        }
      );

    const response =
      await withTimeout(
        request,
        CONFIG.githubTimeout,
        signal
      );

    throwIfAborted(signal);

    /*
     * Explicitly detect rate limiting.
     */
    if (response.status === 403) {

      const remaining =
        response.headers.get(
          "x-ratelimit-remaining"
        );

      if (remaining === "0") {
        throw new Error(
          "GitHub API rate limit exhausted."
        );
      }
    }

    if (!response.ok) {
      throw new Error(
        `GitHub API returned HTTP ${response.status}.`
      );
    }

    return await response.json();

  } finally {

    signal?.removeEventListener(
      "abort",
      abortHandler
    );
  }
}


async function fetchGitHubPages(
  path,
  {
    signal,
    maxPages = CONFIG.githubMaxPages
  } = {}
) {

  const results = [];

  for (
    let page = 1;
    page <= maxPages;
    page++
  ) {

    throwIfAborted(signal);

    const separator =
      path.includes("?")
        ? "&"
        : "?";

    const data =
      await githubFetch(
        `${path}${separator}per_page=${CONFIG.githubPerPage}&page=${page}`,
        { signal }
      );

    if (!Array.isArray(data)) {
      break;
    }

    results.push(...data);

    if (
      data.length <
      CONFIG.githubPerPage
    ) {
      break;
    }
  }

  return results;
}


// ============================================================
// GITHUB KEYWORD COLLECTION
// ============================================================

export async function fetchGitHubKeywords(
  user,
  context = {}
) {

  const username =
    normalizeUsername(user);

  const keywords =
    context.keywords ||
    {};

  context.keywords =
    keywords;

  context.sources ??= [];

  try {

    /*
     * Profile
     */
    const profile =
      await githubFetch(
        `/users/${encodeURIComponent(username)}`,
        {
          signal:
            context.signal
        }
      );

    extractKeywords(
      profile.bio,
      username,
      keywords
    );

    extractKeywords(
      profile.name,
      username,
      keywords
    );

    extractKeywords(
      profile.company,
      username,
      keywords
    );

    extractKeywords(
      profile.blog,
      username,
      keywords
    );

    context.sources.push(
      "GitHub profile"
    );


    /*
     * Repositories
     */
    const repos =
      await fetchGitHubPages(
        `/users/${encodeURIComponent(username)}/repos?sort=updated`,
        {
          signal:
            context.signal
        }
      );

    for (const repo of repos) {

      throwIfAborted(
        context.signal
      );

      extractKeywords(
        repo.name,
        username,
        keywords
      );

      extractKeywords(
        repo.description,
        username,
        keywords
      );

      extractKeywords(
        repo.language,
        username,
        keywords
      );

      extractKeywords(
        repo.topics?.join(" "),
        username,
        keywords
      );
    }

    if (repos.length) {
      context.sources.push(
        "GitHub repositories"
      );
    }


    /*
     * Organizations
     */
    const organizations =
      await fetchGitHubPages(
        `/users/${encodeURIComponent(username)}/orgs`,
        {
          signal:
            context.signal
        }
      );

    for (const organization of organizations) {

      throwIfAborted(
        context.signal
      );

      extractKeywords(
        organization.login,
        username,
        keywords
      );

      extractKeywords(
        organization.description,
        username,
        keywords
      );
    }

    if (organizations.length) {
      context.sources.push(
        "GitHub organizations"
      );
    }

    return keywords;

  } catch (error) {

    /*
     * Aborts should propagate.
     */
    if (
      error?.name ===
      "AbortError"
    ) {
      throw error;
    }

    /*
     * GitHub not having a user is different
     * from the API being unavailable.
     */
    if (
      String(error?.message)
        .includes("HTTP 404")
    ) {
      context.warnings ??= [];

      context.warnings.push(
        "No matching GitHub account found."
      );

      return keywords;
    }

    console.warn(
      "GitHub analysis failed:",
      error
    );

    context.warnings ??= [];

    context.warnings.push(
      `GitHub analysis unavailable: ${error.message}`
    );

    return keywords;
  }
}


// ============================================================
// GRAPH CONSTRUCTION
// ============================================================

export function buildGraph(
  user,
  context = {}
) {
  const username =
    String(user);

  const nodes = [];
  const links = [];

  const nodeIds =
    new Set();

  const linkKeys =
    new Set();


  function addNode(
    id,
    group = 1,
    metadata = {}
  ) {

    const normalizedId =
      String(id);

    if (!normalizedId) {
      return false;
    }

    if (
      nodeIds.has(normalizedId)
    ) {
      return true;
    }

    if (
      nodes.length >=
      CONFIG.maxGraphNodes
    ) {
      return false;
    }

    nodes.push({
      id: normalizedId,
      group,
      ...metadata
    });

    nodeIds.add(
      normalizedId
    );

    return true;
  }


  function addLink(
    source,
    target,
    type = "related"
  ) {

    const key =
      `${source}\u0000${target}\u0000${type}`;

    if (
      linkKeys.has(key)
    ) {
      return;
    }

    if (
      links.length >=
      CONFIG.maxGraphLinks
    ) {
      return;
    }

    links.push({
      source,
      target,
      type
    });

    linkKeys.add(key);
  }


  /*
   * Primary identity.
   */
  addNode(
    username,
    1,
    {
      primary: true
    }
  );


  /*
   * Aliases.
   */
  const aliases =
    context.aliasCandidates instanceof Set
      ? context.aliasCandidates
      : new Set();

  for (const alias of aliases) {

    if (alias === username) {
      continue;
    }

    if (
      addNode(
        alias,
        2,
        {
          type: "alias"
        }
      )
    ) {
      addLink(
        username,
        alias,
        "alias"
      );
    }
  }


  /*
   * External clusters / relationships.
   */
  const clusters =
    Array.isArray(
      context.userClusters?.[username]
    )
      ? context.userClusters[username]
      : [];

  for (const cluster of clusters) {

    if (
      addNode(
        cluster,
        3,
        {
          type: "cluster"
        }
      )
    ) {
      addLink(
        username,
        cluster,
        "cluster"
      );
    }
  }


  context.graphNodes =
    nodes;

  context.graphLinks =
    links;

  return {
    nodes,
    links
  };
}


// ============================================================
// GRAPH RENDERING
// ============================================================

export function renderGraph(
  context = {}
) {

  const container =
    context.container ||
    document.getElementById(
      "dynamicProfile"
    );

  if (!container) {
    return null;
  }

  if (
    typeof window.d3 ===
    "undefined"
  ) {
    console.warn(
      "D3 is unavailable; graph rendering skipped."
    );

    return null;
  }

  const nodes =
    Array.isArray(context.graphNodes)
      ? context.graphNodes
      : [];

  const links =
    Array.isArray(context.graphLinks)
      ? context.graphLinks
      : [];

  if (!nodes.length) {
    return null;
  }


  /*
   * Remove an old graph generated by this module.
   */
  container
    .querySelectorAll(
      "[data-oist-graph]"
    )
    .forEach(
      element => element.remove()
    );


  const section =
    safeCreateElement(
      "section"
    );

  section.dataset.oistGraph =
    "true";

  section.appendChild(
    safeCreateElement(
      "h3",
      "Identity Graph"
    )
  );


  const width =
    Math.min(
      900,
      Math.max(
        320,
        container.clientWidth || 700
      )
    );

  const height = 450;


  const svg =
    d3.select(section)
      .append("svg")
      .attr(
        "viewBox",
        `0 0 ${width} ${height}`
      )
      .attr(
        "width",
        "100%"
      )
      .attr(
        "height",
        height
      )
      .attr(
        "role",
        "img"
      )
      .attr(
        "aria-label",
        "Identity relationship graph"
      );


  const simulation =
    d3.forceSimulation(
      nodes
    )
      .force(
        "link",
        d3.forceLink(
          links
        )
        .id(
          node => node.id
        )
        .distance(100)
      )
      .force(
        "charge",
        d3.forceManyBody()
          .strength(-300)
      )
      .force(
        "center",
        d3.forceCenter(
          width / 2,
          height / 2
        )
      )
      .force(
        "collision",
        d3.forceCollide()
          .radius(24)
      );


  /*
   * Links.
   */
  const link =
    svg
      .append("g")
      .attr(
        "class",
        "links"
      )
      .selectAll("line")
      .data(
        links
      )
      .join("line")
      .attr(
        "stroke",
        "#555"
      )
      .attr(
        "stroke-width",
        1.5
      )
      .attr(
        "opacity",
        0.75
      );


  /*
   * Nodes.
   */
  const node =
    svg
      .append("g")
      .attr(
        "class",
        "nodes"
      )
      .selectAll("circle")
      .data(
        nodes
      )
      .join("circle")
      .attr(
        "r",
        node =>
          node.primary
            ? 9
            : 6
      )
      .attr(
        "fill",
        node => {
          if (node.primary) {
            return "#58a6ff";
          }

          if (
            node.group === 2
          ) {
            return "#f778ba";
          }

          return "#7ee787";
        }
      )
      .attr(
        "stroke",
        "#0b0e13"
      )
      .attr(
        "stroke-width",
        1.5
      );


  /*
   * Labels.
   */
  const label =
    svg
      .append("g")
      .attr(
        "class",
        "labels"
      )
      .selectAll("text")
      .data(
        nodes
      )
      .join("text")
      .text(
        node => node.id
      )
      .attr(
        "font-size",
        "10px"
      )
      .attr(
        "fill",
        "currentColor"
      )
      .attr(
        "pointer-events",
        "none"
      );


  /*
   * Dragging.
   */
  node.call(
    d3.drag()
      .on(
        "start",
        (event, node) => {

          if (!event.active) {
            simulation.alphaTarget(
              0.3
            ).restart();
          }

          node.fx =
            node.x;

          node.fy =
            node.y;
        }
      )
      .on(
        "drag",
        (event, node) => {

          node.fx =
            event.x;

          node.fy =
            event.y;
        }
      )
      .on(
        "end",
        (event, node) => {

          if (!event.active) {
            simulation.alphaTarget(
              0
            );
          }

          node.fx = null;
          node.fy = null;
        }
      )
  );


  /*
   * Simulation updates.
   */
  simulation.on(
    "tick",
    () => {

      link
        .attr(
          "x1",
          node => node.source.x
        )
        .attr(
          "y1",
          node => node.source.y
        )
        .attr(
          "x2",
          node => node.target.x
        )
        .attr(
          "y2",
          node => node.target.y
        );

      node
        .attr(
          "cx",
          node => node.x
        )
        .attr(
          "cy",
          node => node.y
        );

      label
        .attr(
          "x",
          node => node.x + 9
        )
        .attr(
          "y",
          node => node.y + 4
        );
    }
  );


  container.appendChild(
    section
  );

  return {
    svg,
    simulation,
    nodes,
    links
  };
}
