/**
 * ANIMERU — Main Application
 * Streams from AnimePahe via Cloudflare Worker proxy
 */

// ============================================================
// CONFIG — Update WORKER_URL after deploying your CF Worker
// ============================================================
const CONFIG = {
  // Your Cloudflare Worker URL (update after deploying worker.js)
  WORKER_URL: "https://floral-base-8f7f.xxgoldenwarriors.workers.dev/",

  // Fallback: direct AnimePahe API (only works if CORS is open, usually blocked)
  DIRECT_URL: "https://animepahe.ru",

  HERO_COUNT: 8,
  RECENT_PER_PAGE: 24,
  EPISODES_PER_PAGE: 30,
};

// ============================================================
// STATE
// ============================================================
const State = {
  currentPage: "home",
  currentAnime: null,
  currentEpisode: null,
  currentEpisodes: [],
  episodePage: 1,
  episodeTotalPages: 1,
  heroAnimes: [],
  heroIndex: 0,
  heroTimer: null,
  recentPage: 1,
  searchDebounce: null,
  history: JSON.parse(localStorage.getItem("animeru_history") || "[]"),
};

// ============================================================
// API
// ============================================================
const API = {
  base: CONFIG.WORKER_URL,

  async get(endpoint) {
    const url = `${this.base}${endpoint}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`API error: ${resp.status}`);
    return resp.json();
  },

  async search(query) {
    return this.get(`/api/search?q=${encodeURIComponent(query)}`);
  },

  async recent(page = 1) {
    return this.get(`/api/recent?page=${page}`);
  },

  async animeInfo(session) {
    return this.get(`/api/anime/${session}`);
  },

  async episodes(session, page = 1) {
    return this.get(`/api/episodes/${session}?page=${page}`);
  },

  async sources(animeSession, episodeSession) {
    return this.get(`/api/sources/${animeSession}/${episodeSession}`);
  },
};

// ============================================================
// ROUTER
// ============================================================
function navigate(page, params = {}) {
  document.querySelectorAll(".page").forEach((p) => {
    p.classList.remove("active");
    p.classList.add("hidden");
  });

  const el = document.getElementById(`${page}Page`);
  if (!el) return;
  el.classList.remove("hidden");
  el.classList.add("active");
  State.currentPage = page;

  window.scrollTo({ top: 0, behavior: "smooth" });

  if (page === "home") initHome();
  if (page === "detail") initDetail(params.session, params.title, params.image);
  if (page === "watch") initWatch(params);
}

// ============================================================
// HOME
// ============================================================
async function initHome() {
  loadRecent();
  loadHistory();
}

async function loadHero() {
  try {
    const data = await API.recent(1);
    const items = (data.data || []).slice(0, CONFIG.HERO_COUNT);
    if (!items.length) return;

    State.heroAnimes = items;
    renderHero();
  } catch (e) {
    console.warn("Hero load failed:", e);
  }
}

function renderHero() {
  const slidesEl = document.getElementById("heroSlides");
  const infoEl = document.getElementById("heroInfo");
  const dotsEl = document.getElementById("heroDots");
  if (!slidesEl) return;

  slidesEl.innerHTML = "";
  dotsEl.innerHTML = "";

  State.heroAnimes.forEach((anime, i) => {
    const slide = document.createElement("div");
    slide.className = `hero-slide${i === 0 ? " active" : ""}`;

    const coverImg =
      anime.anime_cover ||
      anime.snapshot ||
      anime.anime_image ||
      "https://i.animepahe.ru/posters/default.jpg";
    const posterImg = anime.anime_poster || anime.anime_image || "";
    const title = anime.anime_title || anime.title || "Unknown";
    const session = anime.anime_session || anime.session || "";

    slide.innerHTML = `
      <img class="hero-slide-bg" src="${coverImg}" alt="${title}" onerror="this.src='${posterImg}'" loading="${i === 0 ? "eager" : "lazy"}" />
      <div class="hero-slide-overlay"></div>
    `;
    slidesEl.appendChild(slide);

    const dot = document.createElement("div");
    dot.className = `hero-dot${i === 0 ? " active" : ""}`;
    dot.addEventListener("click", () => setHeroSlide(i));
    dotsEl.appendChild(dot);
  });

  setHeroInfo(0);
  startHeroTimer();
}

function setHeroSlide(index) {
  State.heroIndex = index;
  const slides = document.querySelectorAll(".hero-slide");
  const dots = document.querySelectorAll(".hero-dot");
  slides.forEach((s, i) => s.classList.toggle("active", i === index));
  dots.forEach((d, i) => d.classList.toggle("active", i === index));
  setHeroInfo(index);
}

function setHeroInfo(index) {
  const anime = State.heroAnimes[index];
  if (!anime) return;

  const infoEl = document.getElementById("heroInfo");
  const title = anime.anime_title || anime.title || "Unknown";
  const session = anime.anime_session || anime.session || "";
  const score = anime.score ? `⭐ ${Number(anime.score).toFixed(1)}` : "";
  const epNum = anime.episode || "";
  const year = anime.year || "";

  infoEl.innerHTML = `
    <div class="hero-label">✦ New Episode</div>
    <h1 class="hero-title">${title}</h1>
    <div class="hero-meta">
      ${score ? `<span class="hero-score">${score}</span>` : ""}
      ${epNum ? `<span>EP ${epNum}</span>` : ""}
      ${year ? `<span>${year}</span>` : ""}
    </div>
    <div class="hero-actions">
      <button class="btn-primary" onclick="navigate('detail',{session:'${session}',title:'${title.replace(/'/g, "\\'")}',image:'${(anime.anime_poster || "").replace(/'/g, "\\'")}' })">
        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        Watch Now
      </button>
      <button class="btn-secondary" onclick="navigate('detail',{session:'${session}',title:'${title.replace(/'/g, "\\'")}',image:'${(anime.anime_poster || "").replace(/'/g, "\\'")}' })">
        ℹ Details
      </button>
    </div>
  `;
  infoEl.classList.add("active");
}

function startHeroTimer() {
  if (State.heroTimer) clearInterval(State.heroTimer);
  State.heroTimer = setInterval(() => {
    const next = (State.heroIndex + 1) % State.heroAnimes.length;
    setHeroSlide(next);
  }, 5000);
}

document.getElementById("heroPrev")?.addEventListener("click", () => {
  const n = (State.heroIndex - 1 + State.heroAnimes.length) % State.heroAnimes.length;
  setHeroSlide(n);
  startHeroTimer();
});
document.getElementById("heroNext")?.addEventListener("click", () => {
  const n = (State.heroIndex + 1) % State.heroAnimes.length;
  setHeroSlide(n);
  startHeroTimer();
});

async function loadRecent(page = 1) {
  const grid = document.getElementById("recentGrid");
  if (!grid) return;

  if (page === 1) {
    grid.innerHTML = `<div class="skeleton-row">${Array(12).fill('<div class="card-skeleton"></div>').join("")}</div>`;
  }

  try {
    const data = await API.recent(page);
    const items = data.data || [];

    if (page === 1) {
      grid.innerHTML = "";
      // Also use first items as hero
      if (items.length && !State.heroAnimes.length) {
        State.heroAnimes = items.slice(0, CONFIG.HERO_COUNT);
        renderHero();
      }
    }

    items.forEach((anime) => {
      const card = createAnimeCard({
        title: anime.anime_title || anime.title,
        image: anime.anime_poster || anime.snapshot,
        session: anime.anime_session || anime.session,
        episode: anime.episode,
        type: anime.type,
        year: anime.year,
      });
      grid.appendChild(card);
    });

    // Load more button
    const existing = grid.querySelector(".load-more-wrap");
    if (existing) existing.remove();

    if (items.length >= 20) {
      const wrap = document.createElement("div");
      wrap.className = "load-more-wrap";
      wrap.style.gridColumn = "1 / -1";
      const btn = document.createElement("button");
      btn.className = "load-more-btn";
      btn.textContent = "Load More";
      btn.onclick = () => {
        btn.textContent = "Loading...";
        btn.disabled = true;
        loadRecent(page + 1);
      };
      wrap.appendChild(btn);
      grid.appendChild(wrap);
    }
  } catch (e) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-state-icon">⚠️</div>
      <h3>Could not load anime</h3>
      <p>Make sure your Cloudflare Worker is deployed and the WORKER_URL in app.js is updated.</p>
    </div>`;
    console.error("Recent load error:", e);
  }
}

function createAnimeCard({ title, image, session, episode, type, year, progress }) {
  const card = document.createElement("div");
  card.className = "anime-card";
  card.innerHTML = `
    <div class="card-poster">
      <img src="${image || ""}" alt="${title}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 2 3%22><rect width=%222%22 height=%223%22 fill=%22%2318181f%22/></svg>'" />
      <div class="card-play-overlay">
        <div class="play-circle">
          <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </div>
      </div>
      <div class="card-badges">
        ${episode ? `<span class="badge badge-ep">EP ${episode}</span>` : ""}
        ${type ? `<span class="badge badge-type">${type}</span>` : ""}
      </div>
      ${progress ? `<div class="card-progress"><div class="card-progress-fill" style="width:${progress}%"></div></div>` : ""}
    </div>
    <div class="card-info">
      <div class="card-title">${title || "Unknown"}</div>
      ${year ? `<div class="card-meta"><span>${year}</span></div>` : ""}
    </div>
  `;
  card.addEventListener("click", () =>
    navigate("detail", { session, title, image })
  );
  return card;
}

// ============================================================
// HISTORY
// ============================================================
function saveHistory(item) {
  State.history = State.history.filter((h) => h.session !== item.session);
  State.history.unshift(item);
  if (State.history.length > 24) State.history = State.history.slice(0, 24);
  localStorage.setItem("animeru_history", JSON.stringify(State.history));
}

function loadHistory() {
  const section = document.getElementById("historySection");
  const grid = document.getElementById("historyGrid");
  if (!section || !grid) return;

  if (!State.history.length) {
    section.style.display = "none";
    return;
  }
  section.style.display = "block";
  grid.innerHTML = "";

  State.history.forEach((item) => {
    const card = createAnimeCard({
      title: item.title,
      image: item.image,
      session: item.session,
      episode: item.episode,
      progress: item.progress,
    });
    grid.appendChild(card);
  });
}

document.querySelector(".clear-history-btn")?.addEventListener("click", () => {
  State.history = [];
  localStorage.removeItem("animeru_history");
  loadHistory();
});

// ============================================================
// DETAIL PAGE
// ============================================================
async function initDetail(session, title, image) {
  if (!session) { navigate("home"); return; }

  const container = document.getElementById("detailContainer");
  container.innerHTML = `
    <button class="detail-back" onclick="navigate('home')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      Back
    </button>
    <div class="player-placeholder" style="height:200px; border-radius:12px; margin-bottom:20px;">
      <div class="spinner"></div><p>Loading anime...</p>
    </div>
  `;

  State.currentAnime = { session, title, image };
  State.episodePage = 1;

  try {
    const [infoData, epData] = await Promise.allSettled([
      API.animeInfo(session),
      API.episodes(session, 1),
    ]);

    const info = infoData.status === "fulfilled" ? infoData.value : {};
    const episodes = epData.status === "fulfilled" ? epData.value : {};

    const anime = info;
    const epList = episodes.data || [];
    const totalPages = episodes.last_page || 1;

    State.currentEpisodes = epList;
    State.episodeTotalPages = totalPages;

    const poster = anime.poster || image || "";
    const cover = anime.cover || poster;
    const animeTitle = anime.title || title || "Unknown";
    const desc = anime.description || "No description available.";
    const genres = Array.isArray(anime.genres) ? anime.genres : [];
    const status = anime.status || "";
    const type = anime.type || "";
    const releaseDate = anime.aired || anime.releaseDate || "";
    const totalEp = anime.totalEpisodes || "";
    const score = anime.rating ? Number(anime.rating).toFixed(1) : "";

    container.innerHTML = `
      <button class="detail-back" onclick="navigate('home')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
        Back to Home
      </button>

      <div class="detail-hero">
        <div class="detail-poster">
          <img src="${poster}" alt="${animeTitle}" onerror="this.style.display='none'" />
        </div>
        <div class="detail-info">
          <div>
            <h1 class="detail-title">${animeTitle}</h1>
          </div>
          <div class="detail-tags">
            ${type ? `<span class="detail-tag type">${type}</span>` : ""}
            ${genres.map((g) => `<span class="detail-tag genre">${g}</span>`).join("")}
          </div>
          <div class="detail-stats">
            ${score ? `<div class="stat-item"><div class="stat-label">Score</div><div class="stat-value score">⭐ ${score}</div></div>` : ""}
            ${status ? `<div class="stat-item"><div class="stat-label">Status</div><div class="stat-value ${status.toLowerCase().includes("ongoing") ? "airing" : "finished"}">${status}</div></div>` : ""}
            ${totalEp ? `<div class="stat-item"><div class="stat-label">Episodes</div><div class="stat-value">${totalEp}</div></div>` : ""}
            ${releaseDate ? `<div class="stat-item"><div class="stat-label">Aired</div><div class="stat-value">${releaseDate}</div></div>` : ""}
          </div>
          <p class="detail-desc" id="detailDesc">${desc}</p>
          <button class="desc-toggle" id="descToggle">Show more</button>
          <div class="detail-actions">
            ${epList.length ? `<button class="btn-primary" onclick="playEpisode('${session}','${epList[0].session}',1,'${animeTitle.replace(/'/g, "\\'")}','${poster.replace(/'/g, "\\'")}',${totalPages})">
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              Watch EP 1
            </button>` : ""}
          </div>
        </div>
      </div>

      <div class="episodes-section" id="episodesSection"></div>
    `;

    // Toggle desc
    const descEl = document.getElementById("detailDesc");
    const toggleEl = document.getElementById("descToggle");
    if (desc.length < 200) toggleEl.style.display = "none";
    toggleEl.addEventListener("click", () => {
      descEl.classList.toggle("expanded");
      toggleEl.textContent = descEl.classList.contains("expanded")
        ? "Show less"
        : "Show more";
    });

    renderEpisodes(epList, session, animeTitle, poster, totalPages);
  } catch (e) {
    container.innerHTML = `
      <button class="detail-back" onclick="navigate('home')">← Back</button>
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <h3>Failed to load anime</h3>
        <p>${e.message}</p>
      </div>
    `;
    console.error("Detail error:", e);
  }
}

function renderEpisodes(epList, session, title, poster, totalPages) {
  const section = document.getElementById("episodesSection");
  if (!section) return;

  section.innerHTML = `
    <div class="episodes-header">
      <div class="episodes-title">Episodes <span style="color:var(--text2);font-weight:400;font-size:14px">(${epList.length} shown)</span></div>
      <div class="ep-controls">
        ${totalPages > 1 ? renderPageButtons(session, title, poster, totalPages) : ""}
      </div>
    </div>
    <div class="episode-grid" id="episodeGrid"></div>
  `;

  const grid = document.getElementById("episodeGrid");
  epList.forEach((ep) => {
    const card = document.createElement("div");
    card.className = "ep-card";
    card.dataset.epSession = ep.session;
    const thumb = ep.snapshot || ep.image || "";
    card.innerHTML = `
      ${thumb ? `<img src="${thumb}" alt="EP ${ep.episode}" loading="lazy" />` : ""}
      <div class="ep-card-overlay">
        <span class="ep-number">EP ${ep.episode}</span>
      </div>
      <div class="ep-play-icon">
        <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      </div>
    `;
    card.addEventListener("click", () =>
      playEpisode(session, ep.session, ep.episode, title, poster, totalPages)
    );
    grid.appendChild(card);
  });
}

function renderPageButtons(session, title, poster, totalPages) {
  const currentPage = State.episodePage;
  let btns = "";
  const pages = getPaginationRange(currentPage, totalPages);
  pages.forEach((p) => {
    if (p === "...") {
      btns += `<span style="color:var(--text2);padding:0 4px">…</span>`;
    } else {
      btns += `<button class="ep-page-btn${p === currentPage ? " active" : ""}" onclick="loadEpPage(${p},'${session}','${title.replace(/'/g, "\\'")}','${poster.replace(/'/g, "\\'")}',${totalPages})">${p}</button>`;
    }
  });
  return btns;
}

function getPaginationRange(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [1];
  if (current > 3) pages.push("...");
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
  if (current < total - 2) pages.push("...");
  pages.push(total);
  return pages;
}

async function loadEpPage(page, session, title, poster, totalPages) {
  State.episodePage = page;
  const epData = await API.episodes(session, page);
  const epList = epData.data || [];
  State.currentEpisodes = epList;
  renderEpisodes(epList, session, title, poster, totalPages);
}

// ============================================================
// WATCH PAGE
// ============================================================
async function playEpisode(animeSession, episodeSession, epNumber, title, poster, totalPages) {
  State.currentAnime = { session: animeSession, title, image: poster };
  State.currentEpisode = { session: episodeSession, number: epNumber };

  navigate("watch", {
    animeSession,
    episodeSession,
    epNumber,
    title,
    poster,
    totalPages,
  });
}

async function initWatch({ animeSession, episodeSession, epNumber, title, poster, totalPages }) {
  const playerEl = document.getElementById("playerContainer");
  const infoBar = document.getElementById("episodeInfoBar");
  const sidebar = document.getElementById("watchSidebar");
  const metaEl = document.getElementById("watchMeta");

  // Show loading
  playerEl.innerHTML = `<div class="player-placeholder"><div class="spinner"></div><p>Loading episode...</p></div>`;
  infoBar.innerHTML = "";
  sidebar.innerHTML = `<div class="player-placeholder" style="height:200px"><div class="spinner"></div></div>`;

  // Render meta
  metaEl.innerHTML = `
    <div class="watch-anime-info">
      <div class="watch-anime-poster">
        <img src="${poster}" alt="${title}" />
      </div>
      <div>
        <div class="watch-anime-title">${title}</div>
        <button class="btn-secondary" style="margin-top:8px;font-size:12px;padding:6px 14px" onclick="navigate('detail',{session:'${animeSession}',title:'${title.replace(/'/g, "\\'")}',image:'${poster.replace(/'/g, "\\'")}' })">
          ← Back to Episodes
        </button>
      </div>
    </div>
  `;

  try {
    // Load sources & episode list concurrently
    const [sourcesData, epData] = await Promise.allSettled([
      API.sources(animeSession, episodeSession),
      State.currentEpisodes.length
        ? Promise.resolve({ data: State.currentEpisodes })
        : API.episodes(animeSession, 1),
    ]);

    const sources =
      sourcesData.status === "fulfilled"
        ? sourcesData.value.sources || []
        : [];
    const epList =
      epData.status === "fulfilled" ? epData.value.data || [] : [];

    if (!State.currentEpisodes.length) State.currentEpisodes = epList;

    // Find prev/next
    const epIndex = epList.findIndex(
      (e) => e.session === episodeSession || String(e.episode) === String(epNumber)
    );
    const prevEp = epIndex > 0 ? epList[epIndex - 1] : null;
    const nextEp = epIndex < epList.length - 1 ? epList[epIndex + 1] : null;

    // Render player
    if (sources.length > 0) {
      const defaultSource = sources[0];
      renderPlayer(playerEl, defaultSource.url, title);
      renderQualityBar(playerEl, sources, animeSession, epNumber, title, poster);
    } else {
      playerEl.innerHTML = `
        <div class="player-placeholder">
          <div style="font-size:32px;margin-bottom:8px">⚠️</div>
          <p>No sources found for this episode.</p>
          <p style="font-size:12px;color:var(--text2);margin-top:8px">Try another episode or check your Worker deployment.</p>
        </div>
      `;
    }

    // Episode nav bar
    infoBar.innerHTML = `
      <div>
        <div class="ep-info-title">${title}</div>
        <div class="ep-info-sub">Episode ${epNumber}</div>
      </div>
      <div class="ep-nav-btns">
        <button class="ep-nav-btn" ${!prevEp ? "disabled" : ""} onclick="playEpisode('${animeSession}','${prevEp?.session || ""}',${prevEp?.episode || 0},'${title.replace(/'/g, "\\'")}','${poster.replace(/'/g, "\\'")}',${totalPages})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
          Prev
        </button>
        <button class="ep-nav-btn" ${!nextEp ? "disabled" : ""} onclick="playEpisode('${animeSession}','${nextEp?.session || ""}',${nextEp?.episode || 0},'${title.replace(/'/g, "\\'")}','${poster.replace(/'/g, "\\'")}',${totalPages})">
          Next
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
    `;

    // Sidebar episode list
    renderSidebar(sidebar, epList, animeSession, episodeSession, epNumber, title, poster, totalPages);

    // Save to history
    saveHistory({
      session: animeSession,
      title,
      image: poster,
      episode: epNumber,
      progress: 0,
    });

  } catch (e) {
    playerEl.innerHTML = `<div class="player-placeholder"><p>Error: ${e.message}</p></div>`;
    console.error("Watch error:", e);
  }
}

function renderPlayer(container, kwikEmbedUrl, title) {
  // Clear previous
  container.innerHTML = "";

  const iframe = document.createElement("iframe");
  iframe.src = kwikEmbedUrl;
  iframe.setAttribute("allowfullscreen", "true");
  iframe.setAttribute("allow", "autoplay; fullscreen; picture-in-picture");
  iframe.setAttribute("scrolling", "no");
  iframe.title = title;
  container.appendChild(iframe);
}

function renderQualityBar(playerContainer, sources, animeSession, epNumber, title, poster) {
  // Insert quality bar after player wrap
  const playerWrap = playerContainer.closest(".player-wrap");
  if (!playerWrap) return;

  const existing = playerWrap.querySelector(".quality-bar");
  if (existing) existing.remove();

  const bar = document.createElement("div");
  bar.className = "quality-bar";
  bar.innerHTML = `<span class="quality-label">Quality:</span>`;

  sources.forEach((src, i) => {
    const btn = document.createElement("button");
    btn.className = `quality-btn${i === 0 ? " active" : ""}`;
    const label = src.quality || `Source ${i + 1}`;
    const audio = src.audio === "eng" ? " DUB" : "";
    btn.textContent = label + audio;
    btn.addEventListener("click", () => {
      bar.querySelectorAll(".quality-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderPlayer(playerContainer, src.url, title);
    });
    bar.appendChild(btn);
  });

  playerWrap.appendChild(bar);
}

function renderSidebar(sidebar, epList, animeSession, currentEpSession, currentEpNum, title, poster, totalPages) {
  sidebar.innerHTML = `
    <div class="sidebar-header">
      <span class="sidebar-title">Episodes</span>
      <span class="sidebar-count">${epList.length} eps</span>
    </div>
  `;

  const list = document.createElement("div");
  epList.forEach((ep) => {
    const isCurrent = ep.session === currentEpSession || String(ep.episode) === String(currentEpNum);
    const item = document.createElement("div");
    item.className = `sidebar-ep${isCurrent ? " active" : ""}`;
    const thumb = ep.snapshot || ep.image || "";
    item.innerHTML = `
      <div class="sidebar-ep-thumb">
        ${thumb ? `<img src="${thumb}" alt="EP ${ep.episode}" loading="lazy" />` : ""}
      </div>
      <div class="sidebar-ep-info">
        <div class="sidebar-ep-num">Episode ${ep.episode}</div>
        <div class="sidebar-ep-title">${ep.title || `Episode ${ep.episode}`}</div>
        ${ep.duration ? `<div class="sidebar-ep-dur">⏱ ${ep.duration}</div>` : ""}
      </div>
    `;
    item.addEventListener("click", () => {
      if (!isCurrent) {
        playEpisode(animeSession, ep.session, ep.episode, title, poster, totalPages);
      }
    });
    list.appendChild(item);
    if (isCurrent) {
      setTimeout(() => item.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
    }
  });
  sidebar.appendChild(list);
}

// ============================================================
// SEARCH
// ============================================================
const searchInput = document.getElementById("searchInput");
const searchResultsEl = document.getElementById("searchResults");

searchInput?.addEventListener("input", (e) => {
  clearTimeout(State.searchDebounce);
  const q = e.target.value.trim();
  if (!q) {
    searchResultsEl.classList.add("hidden");
    return;
  }
  State.searchDebounce = setTimeout(() => doSearch(q), 350);
});

searchInput?.addEventListener("focus", (e) => {
  if (e.target.value.trim()) searchResultsEl.classList.remove("hidden");
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-wrap")) {
    searchResultsEl.classList.add("hidden");
  }
});

// Keyboard shortcut
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "k") {
    e.preventDefault();
    searchInput?.focus();
  }
  if (e.key === "Escape") {
    searchInput?.blur();
    searchResultsEl.classList.add("hidden");
  }
});

async function doSearch(query) {
  searchResultsEl.classList.remove("hidden");
  searchResultsEl.innerHTML = `<div class="search-loading"><div class="spinner" style="margin:0 auto"></div></div>`;

  try {
    const data = await API.search(query);
    const results = data.data || data.results || [];

    if (!results.length) {
      searchResultsEl.innerHTML = `<div class="search-empty">No results for "${query}"</div>`;
      return;
    }

    searchResultsEl.innerHTML = "";
    results.slice(0, 8).forEach((anime) => {
      const item = document.createElement("div");
      item.className = "search-item";
      const session = anime.id || anime.session || "";
      const title = anime.title || "Unknown";
      const image = anime.image || anime.poster || "";
      const year = anime.releaseDate || anime.year || "";
      const type = anime.type || "";

      item.innerHTML = `
        <img src="${image}" alt="${title}" />
        <div class="search-item-info">
          <div class="search-item-title">${title}</div>
          <div class="search-item-meta">${[type, year].filter(Boolean).join(" · ")}</div>
        </div>
      `;
      item.addEventListener("click", () => {
        searchResultsEl.classList.add("hidden");
        searchInput.value = "";
        // consumet API returns id as "numericId/session", extract session
        const realSession = session.includes("/") ? session.split("/")[1] : session;
        navigate("detail", { session: realSession, title, image });
      });
      searchResultsEl.appendChild(item);
    });
  } catch (e) {
    searchResultsEl.innerHTML = `<div class="search-empty">Search failed — check Worker deployment</div>`;
  }
}

// ============================================================
// GENRE PILLS
// ============================================================
document.getElementById("genrePills")?.addEventListener("click", (e) => {
  const pill = e.target.closest(".genre-pill");
  if (!pill) return;
  document.querySelectorAll(".genre-pill").forEach((p) => p.classList.remove("active"));
  pill.classList.add("active");
  // Filter/search by genre
  const genre = pill.dataset.genre;
  if (genre) {
    doSearch(genre);
    navigate("home");
  } else {
    loadRecent(1);
  }
});

// ============================================================
// RANDOM BUTTON
// ============================================================
document.getElementById("randomBtn")?.addEventListener("click", async () => {
  try {
    const page = Math.floor(Math.random() * 5) + 1;
    const data = await API.recent(page);
    const items = data.data || [];
    if (!items.length) return;
    const random = items[Math.floor(Math.random() * items.length)];
    navigate("detail", {
      session: random.anime_session || random.session,
      title: random.anime_title || random.title,
      image: random.anime_poster || random.snapshot,
    });
  } catch (e) {
    showToast("Failed to load random anime");
  }
});

document.getElementById("historyBtn")?.addEventListener("click", () => {
  navigate("home");
  setTimeout(() => {
    document.getElementById("historySection")?.scrollIntoView({ behavior: "smooth" });
  }, 100);
});

// ============================================================
// TOAST
// ============================================================
function showToast(msg, duration = 3000) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), duration);
}

// ============================================================
// INIT
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  initHome();
  loadRecent();
  loadHistory();
});
