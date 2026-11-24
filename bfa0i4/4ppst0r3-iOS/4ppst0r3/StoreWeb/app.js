/* 4ppst0r3 — LiveContainer source catalogue. */

const STORAGE_KEY = "lc-store.sources.v1";
const FETCH_TIMEOUT = 15000;
const screen = document.querySelector("#screen");
const modalRoot = document.querySelector("#modal-root");
const toastNode = document.querySelector("#toast");

const state = {
  page: "today",
  sources: [],
  apps: [],
  selected: null,
  search: "",
  category: "All",
  loading: false
};

const categories = ["All", "Utilities", "Developer Tools", "Games", "Entertainment", "Other"];

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function safeURL(value, base, allowDataImage = false) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    if (allowDataImage && /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,/i.test(value)) return value;
    const url = new URL(value, base);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function showToast(message) {
  toastNode.textContent = message;
  toastNode.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toastNode.classList.remove("show"), 2800);
}

function validSourceURL(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

function loadSavedSources() {
  let saved = [];
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    showToast("Saved sources couldn't be read");
  }

  if (!Array.isArray(saved)) saved = [];
  const seen = new Set();
  state.sources = saved.flatMap(item => {
    const url = item && validSourceURL(item.url);
    if (!url || seen.has(url.href)) return [];
    seen.add(url.href);
    return [{ name: typeof item.name === "string" && item.name.trim() ? item.name : url.hostname,
      url: url.href, apps: [], error: "", loading: false }];
  });
}

function persistSources() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.sources.map(({ name, url }) => ({ name, url }))));
  } catch {
    showToast("Could not save sources on this device");
  }
}

function normalizeCategory(value) {
  const category = String(value || "Other").trim();
  const match = categories.find(item => item.toLowerCase() === category.toLowerCase());
  if (match) return match;
  if (/game/i.test(category)) return "Games";
  if (/utilit|tool/i.test(category)) return "Utilities";
  if (/develop|program|code/i.test(category)) return "Developer Tools";
  if (/entertain|media|music|video/i.test(category)) return "Entertainment";
  return category || "Other";
}

function normalizeSource(data, sourceURL) {
  if (!data || !Array.isArray(data.apps)) throw new Error("This source doesn't contain an apps list.");

  const sourceName = typeof data.name === "string" && data.name.trim() ? data.name.trim() : new URL(sourceURL).hostname;
  const apps = [];

  for (const raw of data.apps) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const versions = Array.isArray(raw.versions) ? raw.versions.filter(v => v && typeof v === "object") : [];
    const latest = versions[0] || {};
    const rawScreenshots = latest.screenshotURLs || latest.screenshots || raw.screenshotURLs || raw.screenshots || [];
    const screenshots = (Array.isArray(rawScreenshots) ? rawScreenshots : [rawScreenshots])
      .map(item => safeURL(typeof item === "string" ? item : item?.url, sourceURL))
      .filter(Boolean);

    apps.push({
      name: String(raw.name || raw.title || "Unnamed app"),
      bundleIdentifier: String(raw.bundleIdentifier || raw.bundleID || ""),
      developerName: String(raw.developerName || raw.developer || data.name || "Unknown developer"),
      subtitle: String(raw.subtitle || raw.description || ""),
      localizedDescription: String(latest.localizedDescription || raw.localizedDescription || raw.description || raw.subtitle || ""),
      iconURL: safeURL(raw.iconURL || raw.icon || "", sourceURL, true),
      category: normalizeCategory(raw.category),
      sourceName,
      sourceURL,
      version: String(latest.version || raw.version || ""),
      versionDate: String(latest.date || raw.versionDate || ""),
      size: latest.size ?? raw.size ?? null,
      minimumOSVersion: String(latest.minOSVersion || raw.minimumOSVersion || ""),
      screenshots,
      versions: versions.map(version => ({
        version: String(version.version || "Unknown"),
        date: String(version.date || ""),
        size: version.size ?? null
      }))
    });
  }

  return { sourceName, apps };
}

async function fetchSource(source) {
  source.error = "";
  source.loading = true;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const response = await fetch(source.url, { cache: "no-store", signal: controller.signal,
      headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Server returned HTTP ${response.status}.`);
    const data = await response.json();
    const normalized = normalizeSource(data, source.url);
    source.name = normalized.sourceName;
    source.apps = normalized.apps;
    source.lastUpdated = new Date().toISOString();
  } catch (error) {
    source.error = error?.name === "AbortError" ? "Request timed out. Try again." :
      error instanceof SyntaxError ? "The source returned invalid JSON." :
      error instanceof TypeError ? "Couldn't reach this source. Check its URL and CORS access." :
      (error instanceof Error ? error.message : "Could not read this source.");
    source.apps = [];
  } finally {
    clearTimeout(timeout);
    source.loading = false;
  }
}

async function refreshAll() {
  if (state.loading || !state.sources.length || state.sources.some(source => source.loading)) return;
  state.loading = true;
  render();
  await Promise.all(state.sources.map(fetchSource));
  rebuildApps();
  persistSources();
  state.loading = false;
  render();
  const failed = state.sources.filter(source => source.error).length;
  showToast(failed ? `${failed} source${failed === 1 ? "" : "s"} couldn't refresh` : "Sources updated");
}

function rebuildApps() {
  state.apps = state.sources.flatMap(source => source.apps || []);
}

function getVisibleApps() {
  const query = state.search.trim().toLocaleLowerCase();
  return state.apps.filter(app => {
    const haystack = [app.name, app.subtitle, app.developerName, app.category,
      app.bundleIdentifier, app.sourceName].join(" ").toLocaleLowerCase();
    return (!query || haystack.includes(query)) &&
      (state.category === "All" || app.category === state.category);
  });
}

function appIcon(app, extraClass = "") {
  return app.iconURL
    ? `<img class="app-icon ${extraClass}" src="${escapeHTML(app.iconURL)}" alt="" loading="lazy">`
    : `<div class="app-icon app-icon-fallback ${extraClass}" aria-hidden="true">▣</div>`;
}

function appRow(app) {
  const index = state.apps.indexOf(app);
  return `
    <article class="app-row" data-open-app="${index}" tabindex="0" role="button" aria-label="View ${escapeHTML(app.name)}">
      ${appIcon(app)}
      <div class="app-info">
        <span class="app-name">${escapeHTML(app.name)}</span>
        <span class="app-caption">${escapeHTML(app.subtitle || app.developerName)}</span>
        <span class="app-source">${escapeHTML(app.sourceName)}</span>
      </div>
      <button class="get-button" data-open-source="${escapeHTML(app.sourceURL)}" aria-label="Open ${escapeHTML(app.sourceName)} in LiveContainer">VIEW</button>
    </article>`;
}

function renderToday() {
  const latest = state.apps.slice(0, 5);
  const featured = latest.find(app => app.screenshots?.length) || latest[0];
  const art = featured?.screenshots?.[0] || featured?.iconURL || "";
  const dateLabel = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date());
  return `
    <div class="store-heading">
      <div><div class="eyebrow">${escapeHTML(dateLabel.toUpperCase())}</div><h1>Today</h1></div>
    </div>
    ${featured ? `
      <article class="story-card story-featured" data-open-featured="true" tabindex="0" role="button" aria-label="Discover ${escapeHTML(featured.name)}">
        ${art ? `<img class="story-image" src="${escapeHTML(art)}" alt="" loading="lazy">` : `<div class="story-image story-art-fallback"></div>`}
        <div class="story-shade"></div>
        <div class="story-copy">
          <div class="story-kicker">FROM YOUR SOURCES</div>
          <h2>${escapeHTML(featured.name)}</h2>
          <p>${escapeHTML(featured.subtitle || featured.developerName || "")}</p>
          <span class="story-cta">Discover app <b>›</b></span>
        </div>
      </article>` : `
      <article class="story-card story-welcome">
        <div class="welcome-art"><span class="welcome-glyph">4</span><i></i><b></b></div>
        <div class="story-copy">
          <div class="story-kicker">WELCOME TO 4PPST0R3</div>
          <h2>Your apps.<br>Your sources.</h2>
          <button class="story-cta story-action" data-action="add-source">Add a source <b>›</b></button>
        </div>
      </article>`}

    <section class="store-section">
      <div class="section-heading"><div><div class="section-eyebrow">DISCOVER</div><h2>From your sources</h2></div><button class="text-button" data-action="apps">See all <span>›</span></button></div>
      ${latest.length ? `<div class="app-list">${latest.map(appRow).join("")}</div>` :
        `<div class="empty-state"><b>Your catalogue is empty</b>Add a source to see its apps here.<button class="secondary-button" data-action="add-source">Add source</button></div>`}
    </section>

    <section class="store-section">
      <div class="section-heading"><h2>Browse by category</h2></div>
      <div class="browse-grid">
        <button class="browse-tile browse-games" data-collection="Games"><span class="browse-symbol">⌘</span><b>Games</b></button>
        <button class="browse-tile browse-tools" data-collection="Utilities"><span class="browse-symbol">✳</span><b>Utilities</b></button>
        <button class="browse-tile browse-dev" data-collection="Developer Tools"><span class="browse-symbol">⌁</span><b>Developer tools</b></button>
        <button class="browse-tile browse-ent" data-collection="Entertainment"><span class="browse-symbol">◈</span><b>Entertainment</b></button>
      </div>
    </section>
    ${state.sources.some(source => source.error) ? `<div class="notice">Some sources couldn't refresh. Check Sources for details.</div>` : ""}
  `;
}

function renderApps() {
  const visible = getVisibleApps();
  return `
    <div class="store-heading"><div><div class="eyebrow">EXPLORE</div><h1>Apps</h1></div></div>
    <div class="page-subtitle">${state.apps.length} apps · ${state.sources.length} sources</div>
    <div class="catalogue-toolbar"><div class="search-wrap"><input id="app-search" class="search-field" type="search" placeholder="Search apps" value="${escapeHTML(state.search)}" autocomplete="off"></div></div>
    <div class="filters">${categories.map(category => `<button class="filter ${state.category === category ? "active" : ""}" data-category="${escapeHTML(category)}">${escapeHTML(category)}</button>`).join("")}</div>
    <div class="section-heading list-heading"><h2>${state.category === "All" ? "All apps" : escapeHTML(state.category)}</h2><span class="result-count">${visible.length}</span></div>
    ${visible.length ? `<div class="app-list">${visible.map(appRow).join("")}</div>` :
      `<div class="empty-state"><b>${state.apps.length ? "No apps found" : "No apps yet"}</b>${state.apps.length ? "Try another category or search." : "Add a source to populate your catalogue."}</div>`}
  `;
}

function renderGames() {
  const games = state.apps.filter(app => app.category === "Games");
  return `
    <div class="store-heading"><div><div class="eyebrow">YOUR LIBRARY</div><h1>Games</h1></div></div>
    ${games.length ? `<div class="games-feature"><div class="games-feature-art"><span>GAME</span><b>ON.</b></div><div class="games-feature-copy"><small>FROM YOUR SOURCES</small><h2>Ready when you are.</h2><p>${games.length} ${games.length === 1 ? "game" : "games"}</p></div></div><div class="section-heading list-heading"><h2>All games</h2><span class="result-count">${games.length}</span></div><div class="app-list">${games.map(appRow).join("")}</div>` :
      `<div class="empty-state games-empty"><div class="empty-symbol">⌘</div><b>No games found yet</b>Games from your sources will appear here.<button class="secondary-button" data-action="apps">Browse all apps</button></div>`}
  `;
}

function renderSearch() {
  const suggestions = state.apps.slice(0, 4);
  const results = getVisibleApps();
  return `
    <div class="store-heading"><div><div class="eyebrow">DISCOVER</div><h1>Search</h1></div></div>
    <div class="search-wrap search-large"><input id="app-search" class="search-field" type="search" placeholder="Apps, games, developers" value="${escapeHTML(state.search)}" autocomplete="off"></div>
    ${state.search.trim() ? `
      <div class="section-heading list-heading"><h2>Results</h2><span class="result-count">${results.length}</span></div>
      ${results.length ? `<div class="app-list">${results.map(appRow).join("")}</div>` : `<div class="empty-state"><b>No results</b>Try a different search.</div>`}
    ` : `
      <section class="store-section search-suggestions">
        <div class="section-heading"><h2>Suggested</h2></div>
        ${suggestions.length ? `<div class="app-list">${suggestions.map(appRow).join("")}</div>` : `<div class="empty-state"><b>Nothing here yet</b>Add a source to discover apps.</div>`}
      </section>
      <section class="store-section">
        <div class="section-heading"><h2>Browse</h2></div>
        <div class="browse-grid">
          <button class="browse-tile browse-games" data-collection="Games"><span class="browse-symbol">⌘</span><b>Games</b></button>
          <button class="browse-tile browse-tools" data-collection="Utilities"><span class="browse-symbol">✳</span><b>Utilities</b></button>
          <button class="browse-tile browse-dev" data-collection="Developer Tools"><span class="browse-symbol">⌁</span><b>Developer tools</b></button>
          <button class="browse-tile browse-ent" data-collection="Entertainment"><span class="browse-symbol">◈</span><b>Entertainment</b></button>
        </div>
      </section>
    `}
  `;
}

function renderSources() {
  return `
    <div class="kicker">LIBRARY</div>
    <h1>Sources</h1>
    <p class="page-subtitle">Manage your catalogues.</p>
    <div class="source-toolbar">
      <button class="primary-button" data-action="add-source">＋ Add source</button>
      <button class="secondary-button" data-action="refresh" ${state.loading || !state.sources.length || state.sources.some(source => source.loading) ? "disabled" : ""}>${state.loading ? "Refreshing…" : "Refresh all"}</button>
    </div>
    ${state.sources.length ? state.sources.map((source, index) => `
      <div class="source-card">
        <div class="source-symbol">▤</div>
        <div class="source-info">
          <b>${escapeHTML(source.name)}</b>
          <small>${escapeHTML(source.url)}</small>
          <small class="source-status ${source.error ? "has-error" : ""}">${source.loading ? "Refreshing…" : source.error ? escapeHTML(source.error) : `${source.apps.length} apps${source.lastUpdated ? " · Updated" : ""}`}</small>
        </div>
        <div class="source-actions">
          <button class="pill-button" data-action="open-source" data-source-index="${index}">Open</button>
          <button class="pill-button" data-action="remove-source" data-source-index="${index}">Remove</button>
        </div>
      </div>
    `).join("") : `<div class="empty-state" style="margin-top:20px"><b>No sources added</b>Add a compatible source URL to get started.</div>`}
    <div class="notice">Sources are saved in this browser, separately from LiveContainer. Open sends a source to LiveContainer.</div>
    <div class="creator-credit">4ppst0r3 <span>·</span> by sekondmonitor</div>
  `;
}

function renderDetail(app) {
  const versionList = Array.isArray(app.versions) ? app.versions : [];
  const screenshots = Array.isArray(app.screenshots) ? app.screenshots : [];
  return `
    <button class="detail-back" data-action="back">‹ &nbsp;Back</button>
    <div class="product-hero">
      ${appIcon(app)}
      <div class="detail-title">
        <h1>${escapeHTML(app.name)}</h1>
        <p>${escapeHTML(app.developerName)}</p>
        ${app.subtitle && app.subtitle !== app.developerName ? `<p>${escapeHTML(app.subtitle)}</p>` : ""}
      </div>
    </div>
    <div class="product-actions">
      <button class="get-button detail-get" data-action="open-source" data-source-url="${escapeHTML(app.sourceURL)}">VIEW IN LC</button>
      <span class="version-note">${app.version ? `Version ${escapeHTML(app.version)}` : ""}</span>
    </div>
    <div class="product-facts">
      ${metadata("Category", app.category)}
      ${metadata("Version", app.version || "Not provided")}
      ${metadata("Size", app.size ? formatBytes(app.size) : "Not provided")}
    </div>
    <section class="detail-section">
      <h3>About</h3>
      <div class="description">${escapeHTML(app.localizedDescription || app.subtitle || "No description provided.")}</div>
    </section>
    ${screenshots.length ? `<section class="detail-section"><h3>Screenshots</h3><div class="screenshot-strip">${screenshots.map(url => `<img src="${escapeHTML(url)}" alt="App screenshot" loading="lazy">`).join("")}</div></section>` : ""}
    <section class="detail-section">
      <h3>Information</h3>
      <div class="metadata-grid">
        ${metadata("Developer", app.developerName)}
        ${metadata("Updated", app.versionDate || "Not provided")}
        ${metadata("Minimum iOS", app.minimumOSVersion || "Not provided")}
        ${metadata("Bundle ID", app.bundleIdentifier || "Not provided")}
        ${metadata("Source", app.sourceName)}
      </div>
    </section>
    ${versionList.length ? `<section class="detail-section"><h3>Version history</h3>${versionList.slice(0, 8).map(v => `<div class="source-card"><div class="source-info"><b>${escapeHTML(v.version)}</b><small>${escapeHTML(v.date || "Date not provided")}</small></div><span class="version-note">${v.size ? formatBytes(v.size) : ""}</span></div>`).join("")}</section>` : ""}
  `;
}

function metadata(label, value) {
  return `<div class="metadata-item"><small>${escapeHTML(label)}</small><b>${escapeHTML(value || "Not provided")}</b></div>`;
}

function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return "Not provided";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function render() {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.tab === state.page && !state.selected);
    tab.setAttribute("aria-current", tab.dataset.tab === state.page && !state.selected ? "page" : "false");
  });

  if (state.selected) screen.innerHTML = renderDetail(state.selected);
  else if (state.page === "sources") screen.innerHTML = renderSources();
  else if (state.page === "apps") screen.innerHTML = renderApps();
  else if (state.page === "games") screen.innerHTML = renderGames();
  else if (state.page === "search") screen.innerHTML = renderSearch();
  else screen.innerHTML = renderToday();

  bindScreenEvents();
}

function openSourceInLiveContainer(url) {
  const safe = validSourceURL(url);
  if (!safe) {
    showToast("Invalid source URL");
    return;
  }
  window.location.href = `livecontainer://source?url=${encodeURIComponent(safe.href)}`;
}

function openApp(app) {
  if (!app) return;
  state.selected = app;
  render();
  window.scrollTo(0, 0);
}

function bindScreenEvents() {
  screen.querySelectorAll("[data-action]").forEach(button => {
    button.addEventListener("click", () => handleAction(button.dataset.action, button));
  });

  screen.querySelectorAll("[data-open-app]").forEach(row => {
    const open = () => openApp(state.apps[Number(row.dataset.openApp)]);
    row.addEventListener("click", event => {
      if (!event.target.closest("button")) open();
    });
    row.addEventListener("keydown", event => {
      if (event.target === row && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        open();
      }
    });
  });

  const featured = screen.querySelector("[data-open-featured]");
  if (featured) {
    const openFeatured = () => openApp(state.apps.find(app => app.screenshots?.length) || state.apps[0]);
    featured.addEventListener("click", openFeatured);
    featured.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openFeatured(); }
    });
  }

  screen.querySelectorAll("[data-category]").forEach(button => {
    button.addEventListener("click", () => { state.category = button.dataset.category; render(); });
  });

  screen.querySelectorAll("[data-collection]").forEach(button => {
    button.addEventListener("click", () => {
      state.page = button.dataset.collection === "Games" ? "games" : "apps";
      state.category = button.dataset.collection;
      state.selected = null;
      render();
    });
  });

  screen.querySelectorAll("[data-open-source]").forEach(button => {
    button.addEventListener("click", event => {
      event.stopPropagation();
      openSourceInLiveContainer(button.dataset.openSource);
    });
  });

  screen.querySelectorAll("img.app-icon, .story-image, .screenshot-strip img").forEach(img => {
    img.addEventListener("error", () => {
      if (img.classList.contains("app-icon")) {
        const fallback = document.createElement("div");
        fallback.className = "app-icon app-icon-fallback";
        fallback.setAttribute("aria-hidden", "true");
        fallback.textContent = "▣";
        img.replaceWith(fallback);
      } else {
        img.remove();
      }
    }, { once: true });
  });

  const search = screen.querySelector("#app-search");
  if (search) {
    search.addEventListener("input", event => {
      const cursor = event.target.selectionStart;
      state.search = event.target.value;
      render();
      const next = screen.querySelector("#app-search");
      next?.focus({ preventScroll: true });
      if (next && cursor !== null) next.setSelectionRange(cursor, cursor);
    });
  }
}

function handleAction(action, element) {
  switch (action) {
    case "apps": state.page = "apps"; state.selected = null; state.category = "All"; render(); break;
    case "sources": state.page = "sources"; state.selected = null; render(); break;
    case "back": state.selected = null; render(); break;
    case "add-source": showAddSourceModal(); break;
    case "refresh": refreshAll(); break;
    case "open-source": {
      const index = Number(element.dataset.sourceIndex);
      openSourceInLiveContainer(element.dataset.sourceUrl || state.sources[index]?.url);
      break;
    }
    case "remove-source": {
      const index = Number(element.dataset.sourceIndex);
      const source = state.sources[index];
      if (!source) break;
      state.sources.splice(index, 1);
      rebuildApps();
      persistSources();
      render();
      showToast("Source removed");
      break;
    }
  }
}

function showAddSourceModal() {
  if (modalRoot.firstElementChild) return;
  modalRoot.innerHTML = `
    <div class="modal-backdrop" data-dismiss-modal>
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h2 id="modal-title">Add a source</h2>
        <p>Paste a LiveContainer-compatible source URL.</p>
        <input id="source-url" type="url" inputmode="url" placeholder="https://example.com/source.json" autocomplete="url">
        <div class="modal-actions">
          <button class="secondary-button" data-modal-cancel>Cancel</button>
          <button class="primary-button" data-modal-add>Add source</button>
        </div>
        <p class="modal-hint">The source must allow browser access (CORS).</p>
      </section>
    </div>
  `;

  const backdrop = modalRoot.querySelector(".modal-backdrop");
  const input = modalRoot.querySelector("#source-url");
  const addButton = modalRoot.querySelector("[data-modal-add]");
  const close = () => { modalRoot.innerHTML = ""; };

  backdrop.addEventListener("click", event => {
    if (event.target === backdrop || event.target.closest("[data-modal-cancel]")) close();
  });
  modalRoot.addEventListener("keydown", event => {
    if (event.key === "Escape") close();
    if (event.key === "Enter" && event.target === input) addButton.click();
  });

  addButton.addEventListener("click", async () => {
    const url = validSourceURL(input.value.trim());
    if (!url) {
      input.setCustomValidity("Enter a valid HTTP or HTTPS URL.");
      input.reportValidity();
      return;
    }
    input.setCustomValidity("");
    if (state.sources.some(source => source.url === url.href)) {
      showToast("That source is already added");
      return;
    }

    addButton.disabled = true;
    addButton.textContent = "Adding…";
    const source = { name: url.hostname, url: url.href, apps: [], error: "", loading: true };
    state.sources.push(source);
    close();
    persistSources();
    render();
    await fetchSource(source);
    rebuildApps();
    persistSources();
    render();
    showToast(source.error ? `Couldn't load source: ${source.error}` : `${source.apps.length} apps loaded`);
  });

  input.addEventListener("input", () => input.setCustomValidity(""));
  input.focus();
}

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    state.page = tab.dataset.tab;
    state.selected = null;
    if (state.page === "search" || state.page === "games") state.category = "All";
    render();
    if (state.page === "search") screen.querySelector("#app-search")?.focus();
  });
});

document.querySelector(".wordmark").addEventListener("click", () => {
  state.page = "today";
  state.selected = null;
  render();
  window.scrollTo(0, 0);
});
document.querySelector(".profile-button").addEventListener("click", () => {
  state.page = "sources";
  state.selected = null;
  render();
  window.scrollTo(0, 0);
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !modalRoot.firstElementChild && state.selected) {
    state.selected = null;
    render();
  }
});

loadSavedSources();
render();
if (state.sources.length) refreshAll();
