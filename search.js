"use strict";

/*
 * Search / OSINT profile controller
 *
 * Responsibilities:
 *   - validate input
 *   - load local profile safely
 *   - dynamically load analysis modules
 *   - execute modules in a controlled pipeline
 *   - prevent stale searches from overwriting newer results
 *   - handle cancellation / timeouts
 *   - render results without unsafe HTML interpolation
 *   - maintain per-search state
 */

const CONFIG = Object.freeze({
  moduleDirectory: "./modules/",
  profileDirectory: "./individual/",
  moduleFile: "OIST.js",

  profileTimeout: 10_000,
  moduleTimeout: 15_000,

  maxUsernameLength: 128,

  debug: false
});


/* ============================================================
 * DOM
 * ============================================================ */

const input = document.getElementById("inputSearch");
const btn = document.getElementById("searchBtn");
const result = document.getElementById("result");

if (!input || !btn || !result) {
  throw new Error("Required search UI elements are missing.");
}


/* ============================================================
 * Runtime state
 * ============================================================ */

const runtime = {
  moduleCache: new Map(),
  profileCache: new Map(),

  activeController: null,
  searchId: 0,

  busy: false
};


/* ============================================================
 * Utility
 * ============================================================ */

function createId(prefix = "search") {
  return `${prefix}-${Date.now()}-${crypto.randomUUID()}`;
}


function normalizeUsername(value) {
  return value
    .trim()
    .replace(/\s+/g, "");
}


function validateUsername(username) {
  if (!username) {
    return {
      valid: false,
      reason: "Enter a username."
    };
  }

  if (username.length > CONFIG.maxUsernameLength) {
    return {
      valid: false,
      reason: `Username exceeds ${CONFIG.maxUsernameLength} characters.`
    };
  }

  /*
   * Restrict path traversal and unexpected path syntax.
   *
   * Adjust this regex if your profile naming scheme intentionally
   * supports other characters.
   */
  if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
    return {
      valid: false,
      reason: "Username contains unsupported characters."
    };
  }

  return {
    valid: true,
    reason: null
  };
}


function createAbortError() {
  const error = new Error("Operation aborted.");
  error.name = "AbortError";
  return error;
}


function isAbortError(error) {
  return error?.name === "AbortError";
}


function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw createAbortError();
  }
}


function withTimeout(promise, timeout, signal) {
  return new Promise((resolve, reject) => {
    let finished = false;

    const timer = setTimeout(() => {
      if (finished) return;

      finished = true;

      reject(
        new Error(`Operation timed out after ${timeout}ms.`)
      );
    }, timeout);

    const abortHandler = () => {
      if (finished) return;

      finished = true;
      clearTimeout(timer);

      reject(createAbortError());
    };

    signal?.addEventListener("abort", abortHandler, {
      once: true
    });

    promise.then(
      value => {
        if (finished) return;

        finished = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", abortHandler);

        resolve(value);
      },

      error => {
        if (finished) return;

        finished = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", abortHandler);

        reject(error);
      }
    );
  });
}


/* ============================================================
 * Search session
 * ============================================================ */

function createSearchSession(username) {
  return {
    id: createId(),
    username,

    startedAt: performance.now(),

    keywordCache: {},
    fingerprints: {},
    confidence: {},

    aliasCandidates: new Set(),

    graphNodes: [],
    graphLinks: [],

    errors: [],
    warnings: []
  };
}


function isCurrentSession(session) {
  return (
    session.id === runtime.activeSessionId
  );
}


/* ============================================================
 * Rendering
 * ============================================================ */

function clearElement(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}


function createElement(tag, {
  className,
  text,
  id
} = {}) {
  const element = document.createElement(tag);

  if (className) {
    element.className = className;
  }

  if (id) {
    element.id = id;
  }

  if (text !== undefined) {
    element.textContent = text;
  }

  return element;
}


function renderHeader(username) {
  clearElement(result);

  const header = createElement("h2", {
    text: `Search Results for: ${username}`
  });

  const status = createElement("div", {
    id: "searchStatus",
    className: "search-status",
    text: "Initializing..."
  });

  const local = createElement("div", {
    id: "localProfile"
  });

  const dynamic = createElement("div", {
    id: "dynamicProfile"
  });

  result.append(
    header,
    status,
    local,
    dynamic
  );

  return {
    status,
    local,
    dynamic
  };
}


function setStatus(statusElement, message, type = "normal") {
  statusElement.textContent = message;
  statusElement.dataset.status = type;
}


function renderError(container, title, error) {
  const section = createElement("section", {
    className: "error"
  });

  const heading = createElement("h3", {
    text: title
  });

  const message = createElement("p", {
    text: error?.message || String(error)
  });

  section.append(heading, message);
  container.appendChild(section);
}


function renderDebug(container, keywords) {
  if (!CONFIG.debug) return;

  const section = createElement("section", {
    className: "debug"
  });

  const heading = createElement("h3", {
    text: "All Keywords"
  });

  const pre = createElement("pre", {
    text: JSON.stringify(keywords, null, 2)
  });

  section.append(heading, pre);
  container.appendChild(section);
}


/* ============================================================
 * Fetching
 * ============================================================ */

async function fetchText(url, {
  signal,
  timeout = CONFIG.profileTimeout,
  cache = false
} = {}) {

  if (cache && runtime.profileCache.has(url)) {
    return runtime.profileCache.get(url);
  }

  const request = fetch(url, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    signal,

    headers: {
      "Accept": "text/html,text/plain;q=0.9"
    }
  });

  const response = await withTimeout(
    request,
    timeout,
    signal
  );

  throwIfAborted(signal);

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} ${response.statusText}`
    );
  }

  const contentType =
    response.headers.get("content-type") || "";

  /*
   * Do not blindly inject arbitrary responses into the page.
   */
  if (
    !contentType.includes("text/html") &&
    !contentType.includes("text/plain")
  ) {
    throw new Error(
      `Unexpected response type: ${contentType || "unknown"}`
    );
  }

  const text = await response.text();

  if (cache) {
    runtime.profileCache.set(url, text);
  }

  return text;
}


async function loadLocalProfile(username, signal) {
  const encodedUsername = encodeURIComponent(username);

  const url =
    `${CONFIG.profileDirectory}${encodedUsername}.html`;

  return fetchText(url, {
    signal,
    timeout: CONFIG.profileTimeout,
    cache: true
  });
}


/* ============================================================
 * Safe profile insertion
 * ============================================================ */

function sanitizeProfileHTML(html) {
  /*
   * IMPORTANT:
   *
   * This uses DOMParser rather than directly assigning the
   * fetched document to innerHTML.
   *
   * For truly untrusted remote HTML, use a dedicated sanitizer
   * such as DOMPurify. This basic sanitizer removes the most
   * dangerous executable elements/attributes.
   */

  const parser = new DOMParser();
  const documentFragment = parser.parseFromString(
    html,
    "text/html"
  );

  const forbidden = [
    "script",
    "iframe",
    "object",
    "embed",
    "form",
    "base",
    "meta",
    "link"
  ];

  for (const tag of forbidden) {
    documentFragment
      .querySelectorAll(tag)
      .forEach(element => element.remove());
  }

  /*
   * Remove inline event handlers.
   *
   * Example:
   *   onclick=""
   *   onload=""
   *   onerror=""
   */
  documentFragment
    .querySelectorAll("*")
    .forEach(element => {
      for (const attribute of [...element.attributes]) {
        if (
          attribute.name.toLowerCase().startsWith("on")
        ) {
          element.removeAttribute(attribute.name);
        }
      }
    });

  return documentFragment.body;
}


function renderLocalProfile(container, html) {
  clearElement(container);

  const sanitized = sanitizeProfileHTML(html);

  /*
   * Import only the body contents.
   */
  for (const node of [...sanitized.childNodes]) {
    container.appendChild(node);
  }
}


/* ============================================================
 * Dynamic module loader
 * ============================================================ */

async function importModule(file, signal) {
  throwIfAborted(signal);

  if (runtime.moduleCache.has(file)) {
    return runtime.moduleCache.get(file);
  }

  /*
   * Only allow local module filenames.
   */
  if (!/^[a-zA-Z0-9._-]+\.js$/.test(file)) {
    throw new Error(`Invalid module filename: ${file}`);
  }

  const moduleURL =
    `${CONFIG.moduleDirectory}${encodeURIComponent(file)}`;

  try {
    const promise = import(moduleURL);

    const module = await withTimeout(
      promise,
      CONFIG.moduleTimeout,
      signal
    );

    throwIfAborted(signal);

    runtime.moduleCache.set(file, module);

    return module;

  } catch (error) {
    console.error(
      `Module load failed: ${file}`,
      error
    );

    throw new Error(
      `Unable to load analysis module "${file}".`,
      { cause: error }
    );
  }
}


/* ============================================================
 * Module validation
 * ============================================================ */

const REQUIRED_MODULES = [
  "extractKeywords",
  "fetchGitHubKeywords",
  "detectAliases",
  "buildFingerprint",
  "inferPersona",
  "displayFingerprint",
  "buildGraph",
  "renderGraph"
];


function validateModule(mod) {
  const missing = REQUIRED_MODULES.filter(
    name => typeof mod[name] !== "function"
  );

  if (missing.length > 0) {
    throw new Error(
      `Analysis module is missing: ${missing.join(", ")}`
    );
  }
}


/* ============================================================
 * Module execution
 * ============================================================ */

async function executeModuleStep(
  session,
  name,
  fn,
  {
    signal,
    required = true
  } = {}
) {

  throwIfAborted(signal);

  try {
    const result = await fn();

    throwIfAborted(signal);

    return result;

  } catch (error) {

    if (isAbortError(error)) {
      throw error;
    }

    session.errors.push({
      module: name,
      error
    });

    console.error(
      `Analysis step failed: ${name}`,
      error
    );

    if (required) {
      throw new Error(
        `Analysis step "${name}" failed.`,
        { cause: error }
      );
    }

    session.warnings.push(
      `${name} failed and was skipped.`
    );

    return undefined;
  }
}


/* ============================================================
 * Analysis pipeline
 * ============================================================ */

async function runModules(
  session,
  {
    dynamic,
    local,
    status,
    signal
  }
) {

  const mod = await importModule(
    CONFIG.moduleFile,
    signal
  );

  validateModule(mod);

  throwIfAborted(signal);

  const keywords =
    session.keywordCache;

  /*
   * Local profile extraction
   */
  if (local.textContent?.trim()) {
    setStatus(
      status,
      "Extracting profile data..."
    );

    await executeModuleStep(
      session,
      "extractKeywords",
      () => mod.extractKeywords(
        local.textContent,
        session.username,
        keywords
      ),
      { signal }
    );
  }

  /*
   * GitHub keyword discovery
   */
  setStatus(
    status,
    "Collecting technical indicators..."
  );

  await executeModuleStep(
    session,
    "fetchGitHubKeywords",
    () => mod.fetchGitHubKeywords(
      session.username
    ),
    {
      signal,
      required: false
    }
  );

  /*
   * Alias detection
   */
  setStatus(
    status,
    "Analyzing aliases..."
  );

  await executeModuleStep(
    session,
    "detectAliases",
    () => mod.detectAliases(
      session.username
    ),
    {
      signal,
      required: false
    }
  );

  /*
   * Fingerprinting
   */
  setStatus(
    status,
    "Building technical fingerprint..."
  );

  await executeModuleStep(
    session,
    "buildFingerprint",
    () => mod.buildFingerprint(
      session.username,
      keywords
    ),
    { signal }
  );

  /*
   * Persona inference
   */
  setStatus(
    status,
    "Generating analytical profile..."
  );

  await executeModuleStep(
    session,
    "inferPersona",
    () => mod.inferPersona(
      keywords,
      dynamic
    ),
    {
      signal,
      required: false
    }
  );

  /*
   * Fingerprint rendering
   */
  await executeModuleStep(
    session,
    "displayFingerprint",
    () => mod.displayFingerprint(
      dynamic
    ),
    {
      signal,
      required: false
    }
  );

  /*
   * Graph construction
   */
  setStatus(
    status,
    "Building identity graph..."
  );

  await executeModuleStep(
    session,
    "buildGraph",
    () => mod.buildGraph(
      session.username
    ),
    {
      signal,
      required: false
    }
  );

  /*
   * Graph rendering
   */
  await executeModuleStep(
    session,
    "renderGraph",
    () => mod.renderGraph(),
    {
      signal,
      required: false
    }
  );

  renderDebug(
    dynamic,
    keywords
  );

  return session;
}


/* ============================================================
 * Search controller
 * ============================================================ */

async function search(username) {

  const validation =
    validateUsername(username);

  if (!validation.valid) {
    throw new Error(validation.reason);
  }

  /*
   * Cancel previous search.
   */
  runtime.activeController?.abort();

  const controller =
    new AbortController();

  runtime.activeController =
    controller;

  const signal =
    controller.signal;

  const session =
    createSearchSession(username);

  runtime.activeSessionId =
    session.id;

  runtime.busy = true;

  const ui =
    renderHeader(username);

  setStatus(
    ui.status,
    "Loading profile..."
  );

  try {

    /*
     * Load local profile.
     */
    try {

      const html =
        await loadLocalProfile(
          username,
          signal
        );

      throwIfAborted(signal);

      renderLocalProfile(
        ui.local,
        html
      );

    } catch (error) {

      if (isAbortError(error)) {
        throw error;
      }

      session.warnings.push(
        `Local profile unavailable: ${error.message}`
      );

      renderError(
        ui.local,
        "Local profile unavailable",
        error
      );
    }

    throwIfAborted(signal);

    /*
     * Make sure this isn't an old search.
     */
    if (!isCurrentSession(session)) {
      return;
    }

    await runModules(
      session,
      {
        dynamic: ui.dynamic,
        local: ui.local,
        status: ui.status,
        signal
      }
    );

    throwIfAborted(signal);

    if (!isCurrentSession(session)) {
      return;
    }

    const elapsed =
      Math.round(
        performance.now() -
        session.startedAt
      );

    setStatus(
      ui.status,
      `Analysis complete in ${elapsed} ms.`
    );

    /*
     * Display non-fatal warnings.
     */
    if (session.warnings.length > 0) {

      const warning = createElement(
        "section",
        {
          className: "warnings"
        }
      );

      warning.appendChild(
        createElement(
          "h3",
          {
            text: "Analysis Warnings"
          }
        )
      );

      const list =
        createElement("ul");

      for (const message of session.warnings) {
        list.appendChild(
          createElement(
            "li",
            {
              text: message
            }
          )
        );
      }

      warning.appendChild(list);

      ui.dynamic.appendChild(
        warning
      );
    }

  } catch (error) {

    if (isAbortError(error)) {
      return;
    }

    console.error(
      "Search failed:",
      error
    );

    if (isCurrentSession(session)) {

      setStatus(
        ui.status,
        "Search failed.",
        "error"
      );

      renderError(
        ui.dynamic,
        "Analysis failed",
        error
      );
    }

  } finally {

    if (
      runtime.activeController === controller
    ) {
      runtime.activeController = null;
      runtime.busy = false;
    }
  }
}


/* ============================================================
 * Event handling
 * ============================================================ */

async function handleSearch(event) {

  event?.preventDefault();

  const username =
    normalizeUsername(input.value);

  if (!username) {
    input.focus();
    return;
  }

  btn.disabled = true;
  input.disabled = true;

  try {
    await search(username);
  } finally {
    btn.disabled = false;
    input.disabled = false;
  }
}


btn.addEventListener(
  "click",
  handleSearch
);


input.addEventListener(
  "keydown",
  event => {
    if (event.key === "Enter") {
      handleSearch(event);
    }

    if (event.key === "Escape") {
      runtime.activeController?.abort();
    }
  }
);
