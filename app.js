/* ============================================================
   Homeschool HQ — main app
   Vanilla JS, no build step, no dependencies beyond jsPDF.
   Loads window.CURRICULUM from curriculum.js
============================================================ */

/* ------------------------------------------------------------
   STATE
------------------------------------------------------------ */
const STORAGE_KEY = "homeschoolHQ_v1";

const DEFAULT_KIDS = {
  aubrey: {
    id: "aubrey",
    name: "Aubrey",
    age: 8,
    gradeKey: "3",        // BC Grade 3 curriculum
    interests: "",
    notes: "",
    difficulty: { math: 5, reading: 5, writing: 5 }, // 1–10 per subject
    mastery: {}, // { standardId: "not_yet" | "emerging" | "developing" | "proficient" | "extending" }
    references: { math: [], reading: [], writing: [] } // per-subject reference photos
  },
  makena: {
    id: "makena",
    name: "Makena",
    age: 6,
    gradeKey: "1",        // BC Grade 1 curriculum
    interests: "",
    notes: "",
    difficulty: { math: 5, reading: 5, writing: 5 },
    mastery: {},
    references: { math: [], reading: [], writing: [] }
  },
  oakley: {
    id: "oakley",
    name: "Oakley",
    age: 4,
    gradeKey: "K",        // BC K + Pre-K bridge
    interests: "",
    notes: "",
    difficulty: { math: 3, reading: 3, writing: 3 }, // start gentler for the 4yo
    mastery: {},
    references: { math: [], reading: [], writing: [] }
  }
};

const DEFAULT_STATE = {
  currentKidId: "aubrey",
  currentTab: "dashboard",
  kids: DEFAULT_KIDS,
  worksheets: { aubrey: [], makena: [], oakley: [] },
  gradings: { aubrey: [], makena: [], oakley: [] },
  readingLog: { aubrey: [], makena: [], oakley: [] },
  settings: {
    apiKey: "",
    model: "claude-sonnet-4-6"
  }
};

let state = loadState();

// Non-persistent UI state: which template is selected in each subject tab
const uiTemplate = { math: null, reading: null, writing: null };

/* ------------------------------------------------------------
   STORAGE
------------------------------------------------------------ */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    // shallow-merge defaults so new fields don't break old data
    const merged = { ...structuredClone(DEFAULT_STATE), ...parsed };
    // Migrate kids to add new fields (references, etc.)
    Object.keys(merged.kids || {}).forEach(kidId => {
      const kid = merged.kids[kidId];
      if (!kid.references) kid.references = { math: [], reading: [], writing: [] };
      ["math", "reading", "writing"].forEach(s => {
        if (!kid.references[s]) kid.references[s] = [];
      });
    });
    return merged;
  } catch (e) {
    console.error("Failed to load state", e);
    return structuredClone(DEFAULT_STATE);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("Failed to save state", e);
    toast("Couldn't save data — storage may be full", "error");
  }
}

/* ------------------------------------------------------------
   TABS DEFINITION
------------------------------------------------------------ */
const TABS = [
  { id: "dashboard",   label: "Dashboard",   icon: "📊", section: "" },
  { id: "math",        label: "Math",        icon: "🔢", section: "Subjects" },
  { id: "reading",     label: "Reading",     icon: "📖", section: "" },
  { id: "writing",     label: "Writing",     icon: "✏️", section: "" },
  { id: "standards",   label: "Standards",   icon: "📚", section: "Track" },
  { id: "plan",        label: "Daily Plan",  icon: "📅", section: "" },
  { id: "reading-log", label: "Reading Log", icon: "📕", section: "" },
  { id: "portfolio",   label: "Portfolio",   icon: "🗂️", section: "" }
];

/* ------------------------------------------------------------
   ENTRY POINT
------------------------------------------------------------ */
document.addEventListener("DOMContentLoaded", () => {
  injectTracingFontCSS();
  renderHeader();
  renderSidebar();
  renderContent();
  attachGlobalListeners();
});

function injectTracingFontCSS() {
  if (!window.TRACING_FONT_BASE64 || document.getElementById("tracingFontStyle")) return;
  const style = document.createElement("style");
  style.id = "tracingFontStyle";
  style.textContent = `
    @font-face {
      font-family: '${window.TRACING_FONT_NAME || "TracingFont"}';
      src: url('data:font/ttf;base64,${window.TRACING_FONT_BASE64}') format('truetype');
      font-weight: normal;
      font-style: normal;
    }
  `;
  document.head.appendChild(style);
}

function attachGlobalListeners() {
  document.getElementById("settingsBtn").addEventListener("click", openSettings);

  // close-modal helpers
  document.querySelectorAll("[data-close]").forEach(el => {
    el.addEventListener("click", () => closeAllModals());
  });

  // Worksheet modal actions
  document.getElementById("downloadWorksheetBtn").addEventListener("click", downloadCurrentWorksheetPDF);
  document.getElementById("downloadAnswerKeyBtn").addEventListener("click", downloadCurrentAnswerKeyPDF);

  // Grade modal
  document.getElementById("gradeFileInput").addEventListener("change", onGradeFileChosen);
  document.getElementById("runGradingBtn").addEventListener("click", runGrading);

  // Settings actions
  document.getElementById("saveSettingsBtn").addEventListener("click", saveSettings);
  document.getElementById("exportDataBtn").addEventListener("click", exportData);
  document.getElementById("importDataBtn").addEventListener("click", () => document.getElementById("importDataInput").click());
  document.getElementById("importDataInput").addEventListener("change", importData);
}

/* ------------------------------------------------------------
   HEADER & KID SWITCHER
------------------------------------------------------------ */
function renderHeader() {
  const switcher = document.getElementById("kidSwitcher");
  switcher.innerHTML = "";
  Object.values(state.kids).forEach(kid => {
    const btn = document.createElement("button");
    btn.className = "kid-pill" + (kid.id === state.currentKidId ? " active" : "");
    btn.innerHTML = `<span class="kid-name">${kid.name}</span><span class="age">${kid.age} • ${kid.gradeKey === "K" ? "K" : "Gr " + kid.gradeKey}</span>`;
    btn.addEventListener("click", () => setCurrentKid(kid.id));
    switcher.appendChild(btn);
  });
  // Apply kid theme to body
  document.body.classList.remove("kid-aubrey", "kid-makena", "kid-oakley");
  document.body.classList.add("kid-" + state.currentKidId);
}

function setCurrentKid(kidId) {
  state.currentKidId = kidId;
  saveState();
  renderHeader();
  renderSidebar();
  renderContent();
}

/* ------------------------------------------------------------
   SIDEBAR
------------------------------------------------------------ */
function renderSidebar() {
  const sidebar = document.getElementById("sidebar");
  sidebar.innerHTML = "";
  let lastSection = null;
  TABS.forEach(tab => {
    if (tab.section && tab.section !== lastSection) {
      const sec = document.createElement("div");
      sec.className = "sidebar-section";
      sec.textContent = tab.section;
      sidebar.appendChild(sec);
      lastSection = tab.section;
    }
    const btn = document.createElement("button");
    btn.className = "sidebar-tab" + (tab.id === state.currentTab ? " active" : "");
    btn.innerHTML = `<span class="tab-icon">${tab.icon}</span><span>${tab.label}</span>`;
    btn.addEventListener("click", () => setCurrentTab(tab.id));
    sidebar.appendChild(btn);
  });
}

function setCurrentTab(tabId) {
  state.currentTab = tabId;
  saveState();
  renderSidebar();
  renderContent();
}

/* ------------------------------------------------------------
   CONTENT ROUTER
------------------------------------------------------------ */
function renderContent() {
  const c = document.getElementById("content");
  const kid = state.kids[state.currentKidId];
  switch (state.currentTab) {
    case "dashboard":   c.innerHTML = renderDashboard(kid); attachDashboardListeners(kid); break;
    case "math":        c.innerHTML = renderSubject(kid, "math"); attachSubjectListeners(kid, "math"); break;
    case "reading":     c.innerHTML = renderSubject(kid, "reading"); attachSubjectListeners(kid, "reading"); break;
    case "writing":     c.innerHTML = renderSubject(kid, "writing"); attachSubjectListeners(kid, "writing"); break;
    case "standards":   c.innerHTML = renderStandards(kid); attachStandardsListeners(kid); break;
    case "plan":        c.innerHTML = renderDailyPlan(kid); attachPlanListeners(kid); break;
    case "reading-log": c.innerHTML = renderReadingLog(kid); attachReadingLogListeners(kid); break;
    case "portfolio":   c.innerHTML = renderPortfolio(kid); attachPortfolioListeners(kid); break;
    default:            c.innerHTML = "<div class='empty'>Unknown tab</div>";
  }
}

/* ============================================================
   DASHBOARD TAB
============================================================ */
/* ============================================================
   ACHIEVEMENTS / MILESTONES — kid-facing motivation
============================================================ */
function computeAchievements(kid) {
  const worksheets = state.worksheets[kid.id] || [];
  const gradings = state.gradings[kid.id] || [];
  const wc = worksheets.length;
  const streak = computeStreak(worksheets);
  const mc = countMastery(kid);
  const mastered = mc.proficient + mc.extending;
  const best = gradings.reduce((mx, g) => Math.max(mx, g.score || 0), 0);
  const readingBooks = (state.readingLog[kid.id] || []).length;
  const maxDiff = Math.max(kid.difficulty.math, kid.difficulty.reading, kid.difficulty.writing);

  const defs = [
    { id: "first",   icon: "🌱", label: "First Steps",    desc: "Finish your first worksheet", current: wc, target: 1 },
    { id: "ten",     icon: "📚", label: "Bookworm",       desc: "Finish 10 worksheets",        current: wc, target: 10 },
    { id: "tfive",   icon: "🎯", label: "Sharpshooter",   desc: "Finish 25 worksheets",        current: wc, target: 25 },
    { id: "fifty",   icon: "🏅", label: "Champion",       desc: "Finish 50 worksheets",        current: wc, target: 50 },
    { id: "streak3", icon: "🔥", label: "On Fire",        desc: "3 days in a row",             current: streak, target: 3 },
    { id: "streak7", icon: "⚡", label: "Unstoppable",    desc: "7 days in a row",             current: streak, target: 7 },
    { id: "perfect", icon: "💯", label: "Perfect!",       desc: "Score 100% on a worksheet",   current: best >= 100 ? 1 : 0, target: 1 },
    { id: "star5",   icon: "⭐", label: "Rising Star",    desc: "Master 5 skills",             current: mastered, target: 5 },
    { id: "star15",  icon: "🌟", label: "Superstar",      desc: "Master 15 skills",            current: mastered, target: 15 },
    { id: "levelup", icon: "🧗", label: "Level Up",       desc: "Reach Level 7 in a subject",  current: maxDiff, target: 7 },
    { id: "reader",  icon: "📖", label: "Reading Rocket", desc: "Log 10 books read",           current: readingBooks, target: 10 }
  ];
  defs.forEach(d => { d.earned = d.current >= d.target; });
  return defs;
}

function achievementsHTML(kid) {
  const all = computeAchievements(kid);
  const earned = all.filter(a => a.earned);
  const next = all.filter(a => !a.earned)
    .sort((a, b) => (b.current / b.target) - (a.current / a.target))
    .slice(0, 3);

  const earnedChips = earned.length
    ? earned.map(a => `<span title="${escapeAttr(a.desc)}" style="display:inline-flex; align-items:center; gap:5px; background:#fff5d6; border:1px solid #f0d98a; color:#7a5c00; border-radius:999px; padding:5px 12px; font-size:0.85rem; font-weight:600;">${a.icon} ${a.label}</span>`).join("")
    : `<span class="muted" style="font-size:0.85rem;">No badges yet — finish a worksheet to earn your first! 🌱</span>`;

  const nextChips = next.map(a => {
    const pct = Math.min(100, Math.round((a.current / a.target) * 100));
    return `
      <div style="flex:1; min-width:150px; background:#f6f6f4; border-radius:8px; padding:10px 12px;">
        <div style="font-size:0.85rem; font-weight:600; opacity:0.7;">${a.icon} ${a.label}</div>
        <div style="height:8px; background:#e2e2e2; border-radius:4px; overflow:hidden; margin:6px 0 4px;">
          <div style="width:${pct}%; height:100%; background:#7fb3e0;"></div>
        </div>
        <div class="muted" style="font-size:0.72rem;">${a.current}/${a.target} — ${escapeHtml(a.desc)}</div>
      </div>`;
  }).join("");

  return `
    <div class="card">
      <div class="card-title">🏆 ${kid.name}'s badges <span class="muted" style="font-weight:400; font-size:0.8rem;">— ${earned.length} of ${all.length} earned</span></div>
      <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:${next.length ? "14px" : "0"};">${earnedChips}</div>
      ${next.length ? `<div class="muted" style="font-size:0.78rem; margin-bottom:6px;">Next up:</div><div style="display:flex; flex-wrap:wrap; gap:10px;">${nextChips}</div>` : ""}
    </div>
  `;
}

function subjectFeedbackHTML(kid, subject, snap) {
  const meta = { math: "🔢 Math", reading: "📖 Reading", writing: "✏️ Writing" };
  const s = snap[subject];
  const grs = gradingsForSubject(kid, subject);
  const last = grs[0], prev = grs[1];

  let emoji, msg;
  if (!last) { emoji = "🚀"; msg = "Just getting started — let's go!"; }
  else if (last.score >= 85) { emoji = "🌟"; msg = "Crushing it!"; }
  else if (prev && last.score > prev.score) { emoji = "📈"; msg = "Getting better!"; }
  else if (last.score < 65) { emoji = "💪"; msg = "Keep practicing — you've got this!"; }
  else { emoji = "👍"; msg = "Steady progress!"; }

  const lastBadge = last
    ? `<span class="score-badge ${last.score >= 85 ? "score-high" : last.score >= 65 ? "score-mid" : "score-low"}">${last.score}%</span>`
    : `<span class="muted" style="font-size:0.78rem;">no marks yet</span>`;

  return `
    <div class="card" style="display:flex; flex-direction:column; gap:0.45rem;">
      <div class="row-between">
        <strong>${meta[subject]}</strong>
        <span class="tag tag-accent">Level ${s.difficulty}/10</span>
      </div>
      ${masteryBarHTML(s.mastery)}
      <div class="row-between" style="align-items:center;">
        <span style="font-size:0.9rem;">${emoji} ${msg}</span>
        ${lastBadge}
      </div>
      <button class="btn btn-ghost" data-goto-subject="${subject}" style="align-self:flex-start; font-size:0.8rem; padding:0.3rem 0.6rem;">Practice ${subject} →</button>
    </div>
  `;
}

function renderDashboard(kid) {
  const worksheets = state.worksheets[kid.id] || [];
  const gradings = state.gradings[kid.id] || [];
  const recent = [...worksheets].sort((a, b) => b.generatedAt - a.generatedAt).slice(0, 5);
  const recentGradings = [...gradings].sort((a, b) => b.gradedAt - a.gradedAt).slice(0, 5);

  const streak = computeStreak(worksheets);
  const totalWorksheets = worksheets.length;
  const badges = computeAchievements(kid);
  const badgesEarned = badges.filter(b => b.earned).length;
  const snap = buildProgressSnapshot(kid);
  const heatmap = build30DayHeatmap(worksheets);

  // Motivational hero line
  let hero;
  if (streak >= 7) hero = `🔥 ${streak}-day streak — incredible work, ${kid.name}!`;
  else if (streak >= 3) hero = `🔥 ${streak} days in a row — keep the streak alive!`;
  else if (streak > 0) hero = `Nice — ${streak}-day streak going. Let's keep it up!`;
  else if (totalWorksheets > 0) hero = `Ready for a great day of learning, ${kid.name}?`;
  else hero = `Welcome, ${kid.name}! Finish a worksheet to start earning badges. 🌱`;

  return `
    <div class="content-header">
      <div>
        <h2>${kid.name}'s Dashboard</h2>
        <div class="subtitle">${gradeLabel(kid)} • BC Curriculum</div>
      </div>
    </div>

    <div class="card" style="margin-bottom:1.2rem;">
      <div style="font-size:1.05rem; font-weight:600; margin-bottom:0.7rem;">${hero}</div>
      <div class="grid grid-3">
        <div class="kpi-card" style="padding:0.4rem;"><div class="kpi-value">🔥 ${streak}</div><div class="kpi-label">Day streak</div></div>
        <div class="kpi-card" style="padding:0.4rem;"><div class="kpi-value">✅ ${totalWorksheets}</div><div class="kpi-label">Worksheets done</div></div>
        <div class="kpi-card" style="padding:0.4rem;"><div class="kpi-value">🏅 ${badgesEarned}/${badges.length}</div><div class="kpi-label">Badges earned</div></div>
      </div>
    </div>

    <div style="margin-bottom:1.2rem;">${achievementsHTML(kid)}</div>

    <div class="card-title" style="margin-bottom:0.6rem;">📊 How each subject is going</div>
    <div class="grid grid-3" style="margin-bottom:1.4rem;">
      ${["math", "reading", "writing"].map(subj => subjectFeedbackHTML(kid, subj, snap)).join("")}
    </div>

    <div class="grid grid-2">
      <div class="card">
        <div class="card-title">📈 Activity — last 30 days</div>
        <div class="heatmap" id="heatmap">
          ${heatmap.map(c => `<div class="heatmap-cell" data-activity="${c}" title=""></div>`).join("")}
        </div>
        <p class="muted" style="margin-top: 0.8rem;">Each square = one day. Darker = more worksheets that day.</p>
      </div>

      <div class="card">
        <div class="card-title">✅ Recent gradings</div>
        ${recentGradings.length === 0
          ? `<div class="empty"><div class="empty-icon">📥</div>No gradings yet. After ${kid.name} finishes a worksheet, upload a photo to mark it.</div>`
          : `<div class="history-list">${recentGradings.map(g => gradingItemHTML(g)).join("")}</div>`}
      </div>

      <div class="card" style="grid-column: 1 / -1;">
        <div class="card-title">📝 Recent worksheets</div>
        ${recent.length === 0
          ? `<div class="empty"><div class="empty-icon">📄</div>No worksheets yet. Generate one from the Math, Reading, or Writing tab.</div>`
          : `<div class="history-list">${recent.map(w => historyItemHTML(w, findGrading(w.id))).join("")}</div>`}
      </div>
    </div>
  `;
}

function attachDashboardListeners(kid) {
  document.querySelectorAll("[data-action='open-ws']").forEach(el => {
    el.addEventListener("click", () => {
      const id = el.closest("[data-worksheet-id]").dataset.worksheetId;
      openWorksheetModal(id);
    });
  });
  document.querySelectorAll("[data-action='grade']").forEach(el => {
    el.addEventListener("click", () => openGradeModal(el.dataset.worksheetId));
  });
  document.querySelectorAll("[data-action='del-ws']").forEach(el => {
    el.addEventListener("click", (e) => { e.stopPropagation(); deleteWorksheet(el.dataset.worksheetId); });
  });
  document.querySelectorAll("[data-goto-subject]").forEach(btn => {
    btn.addEventListener("click", () => setCurrentTab(btn.dataset.gotoSubject));
  });
}

function gradeLabel(kid) {
  if (kid.gradeKey === "K") return "BC Kindergarten" + (kid.age < 5 ? " (Pre-K bridge)" : "");
  return "BC Grade " + kid.gradeKey;
}

function historyItemHTML(w, grading) {
  const score = grading ? grading.score : null;
  const scoreClass = score === null ? "" : score >= 85 ? "score-high" : score >= 65 ? "score-mid" : "score-low";
  const arrow = grading ? difficultyArrow(grading.recommendation) : "";
  return `
    <div class="history-item" data-worksheet-id="${w.id}">
      <div class="meta" data-action="open-ws" style="cursor:pointer; flex:1;">
        <div class="meta-title">${escapeHtml(w.title)}</div>
        <div class="meta-sub">${formatDate(w.generatedAt)} • ${capitalize(w.subject)} • Difficulty ${w.difficulty}</div>
      </div>
      ${score !== null ? `<span class="score-badge ${scoreClass}">${score}%</span>` : `<button class="btn btn-ghost" data-action="grade" data-worksheet-id="${w.id}" title="Upload completed photo to mark">Mark</button>`}
      ${arrow}
      <button class="icon-btn" data-action="del-ws" data-worksheet-id="${w.id}" title="Delete">✕</button>
    </div>
  `;
}

function gradingItemHTML(g) {
  const score = g.score;
  const scoreClass = score >= 85 ? "score-high" : score >= 65 ? "score-mid" : "score-low";
  const arrow = difficultyArrow(g.recommendation);
  const ws = findWorksheet(g.worksheetId);
  return `
    <div class="history-item">
      <div class="meta">
        <div class="meta-title">${escapeHtml(ws ? ws.title : "Worksheet")}</div>
        <div class="meta-sub">Marked ${formatDate(g.gradedAt)} • ${capitalize(g.recommendation)}</div>
      </div>
      <span class="score-badge ${scoreClass}">${score}%</span>
      ${arrow}
    </div>
  `;
}

function difficultyArrow(rec) {
  if (rec === "harder") return '<span class="diff-arrow up">▲ harder</span>';
  if (rec === "easier") return '<span class="diff-arrow down">▼ easier</span>';
  if (rec === "reteach") return '<span class="diff-arrow">↻ reteach</span>';
  return '<span class="diff-arrow">→ same</span>';
}

function computeStreak(worksheets) {
  if (!worksheets.length) return 0;
  const days = new Set(worksheets.map(w => new Date(w.generatedAt).toDateString()));
  let streak = 0;
  let day = new Date();
  while (days.has(day.toDateString())) {
    streak++;
    day.setDate(day.getDate() - 1);
  }
  return streak;
}

function computeAvgScore(gradings) {
  if (!gradings.length) return null;
  return Math.round(gradings.reduce((s, g) => s + g.score, 0) / gradings.length);
}

function countMastery(kid) {
  const counts = { not_yet: 0, emerging: 0, developing: 0, proficient: 0, extending: 0 };
  Object.values(kid.mastery).forEach(s => { if (counts[s] !== undefined) counts[s]++; });
  return counts;
}

function build30DayHeatmap(worksheets) {
  const days = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toDateString();
    const count = worksheets.filter(w => new Date(w.generatedAt).toDateString() === key).length;
    days.push(count === 0 ? 0 : count >= 4 ? 4 : count >= 3 ? 3 : count >= 2 ? 2 : 1);
  }
  return days;
}

/* ============================================================
   SUBJECT TAB (Math / Reading / Writing)
============================================================ */
function renderSubject(kid, subject) {
  const curriculum = getCurriculumForKid(kid, subject);
  const topics = getTopicsForSubject(curriculum, subject);
  const recent = (state.worksheets[kid.id] || [])
    .filter(w => w.subject === subject)
    .sort((a, b) => b.generatedAt - a.generatedAt)
    .slice(0, 8);

  const templates = window.getTemplatesForSubjectGrade(subject, kid.gradeKey);
  if (uiTemplate[subject] === null && templates.length > 0) {
    uiTemplate[subject] = templates[0].id;
  }
  const selectedTemplate = templates.find(t => t.id === uiTemplate[subject]);
  const isGenericAiMode = uiTemplate[subject] === "__ai__" || !selectedTemplate;
  const isAiTemplate = selectedTemplate && selectedTemplate.usesAI;
  const usesClaude = isGenericAiMode || isAiTemplate;

  return `
    <div class="content-header">
      <div>
        <h2>${subjectLabel(subject)}</h2>
        <div class="subtitle">${kid.name} • ${gradeLabel(kid)} • Difficulty ${kid.difficulty[subject]}/10</div>
      </div>
      <button class="btn btn-secondary" id="uploadGradeBtn">📤 Upload completed worksheet</button>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <div class="card-title">⚡ Generate a worksheet</div>
        <div class="form-group">
          <label>Worksheet style</label>
          <select id="templatePicker">
            ${templates.map(t => `<option value="${t.id}" ${t.id === uiTemplate[subject] ? "selected" : ""}>${escapeHtml(t.label)}${t.usesAI ? " ✨" : ""}</option>`).join("")}
            <option value="__ai__" ${isGenericAiMode ? "selected" : ""}>✨ AI custom (open-ended Claude prompt)</option>
          </select>
        </div>

        <div id="modifierArea">
          ${isGenericAiMode ? renderAiModeControls(kid, subject, topics) : renderTemplateModifiers(selectedTemplate)}
        </div>

        <button class="btn btn-primary btn-block" id="generateBtn" style="margin-top: 0.6rem;">${usesClaude ? "✨ Generate with AI" : "📄 Generate worksheet"}</button>
        ${usesClaude && !state.settings.apiKey ? `<p class="muted" style="margin-top:0.6rem;">⚠️ ${isAiTemplate ? "This worksheet uses AI" : "AI mode"} — needs a Claude API key. ${isAiTemplate ? "Add one in Settings, or use a local template instead." : "Using mock generator until you add one."}</p>` : ""}
        ${isAiTemplate && state.settings.apiKey ? `<p class="muted" style="margin-top:0.6rem;">✨ AI template — generates a fresh ${subjectLabel(subject).toLowerCase()} worksheet via Claude (~2–4¢ per call).</p>` : ""}
        ${!usesClaude ? `<p class="muted" style="margin-top:0.6rem;">📐 Template mode — generates locally, no API needed. Same Scholastic-style layout every time.</p>` : ""}
      </div>

      <div class="card">
        <div class="card-title">📂 Recent ${subjectLabel(subject)} worksheets</div>
        ${recent.length === 0
          ? `<div class="empty"><div class="empty-icon">📄</div>No ${subjectLabel(subject)} worksheets yet. Worksheets save here once you download them.</div>`
          : `<div class="history-list">${recent.map(w => `
              <div class="history-item">
                <div class="meta">
                  <div class="meta-title">${escapeHtml(w.title)}</div>
                  <div class="meta-sub">${formatDate(w.generatedAt)} • ${w.templateId ? "Template" : "AI"} • ${w.questions ? w.questions.length + " qs" : ""}</div>
                </div>
                <button class="btn btn-ghost" data-action="open" data-worksheet-id="${w.id}" title="View">View</button>
                <button class="btn btn-secondary" data-action="grade" data-worksheet-id="${w.id}" title="Upload completed photo to mark">Mark</button>
                <button class="icon-btn" data-action="del-ws" data-worksheet-id="${w.id}" title="Delete (skipped or made by accident)">✕</button>
              </div>
            `).join("")}</div>`}
      </div>
    </div>

    <div class="card" style="margin-top: 1.2rem;">
      <div class="card-title">🖼️ Reference photos <span class="muted" style="font-size: 0.8rem; font-weight: 400;">— upload worksheets you want the AI to mimic in style</span></div>
      ${renderReferenceGallery(kid, subject)}
    </div>
  `;
}

function renderReferenceGallery(kid, subject) {
  const refs = (kid.references && kid.references[subject]) || [];
  return `
    <div class="drop-zone" id="refDropZone" style="margin-bottom: 0.8rem;">
      <input type="file" id="refFileInput" accept="image/*" multiple hidden />
      <label for="refFileInput" class="drop-zone-label">
        <span class="drop-icon">📸</span>
        <span>Click or drop worksheet photos here</span>
        <span class="muted">PNG, JPG, HEIC — auto-resized to keep storage light</span>
      </label>
    </div>
    ${refs.length === 0
      ? `<p class="muted" style="margin: 0;">No references yet for ${kid.name}'s ${subjectLabel(subject)}. Upload examples of worksheets you like — AI mode will attach them as visual style references.</p>`
      : `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 0.6rem; margin-top: 0.5rem;">${refs.map(r => `
          <div style="position: relative; border: 1px solid var(--border); border-radius: 6px; padding: 4px; background: white;">
            <img src="${r.dataUrl}" style="width: 100%; height: 110px; object-fit: cover; border-radius: 4px; display: block;" />
            <div style="font-size: 0.72rem; padding: 4px 2px 0; color: #666; truncate">${escapeHtml(r.label || r.id.slice(-6))}</div>
            <button class="icon-btn" data-action="del-ref" data-ref-id="${r.id}" style="position: absolute; top: 4px; right: 4px; background: rgba(255,255,255,0.9); padding: 2px 6px; font-size: 0.8rem;" title="Remove">✕</button>
          </div>
        `).join("")}</div>`}
  `;
}

function renderAiModeControls(kid, subject, topics) {
  return `
    <div class="form-group">
      <label>Topic / focus</label>
      <select id="genTopic">
        <option value="">Auto — pick what ${kid.name} needs most</option>
        ${topics.map(t => `<option value="${t.id}">${escapeHtml(t.label)}</option>`).join("")}
      </select>
    </div>
    <div class="grid grid-2">
      <div class="form-group">
        <label># of questions</label>
        <input type="number" id="genCount" min="3" max="40" value="${subject === "writing" ? 3 : 10}" />
      </div>
      <div class="form-group">
        <label>Difficulty (1–10)</label>
        <input type="number" id="genDifficulty" min="1" max="10" value="${kid.difficulty[subject]}" />
      </div>
    </div>
    <div class="form-group">
      <label>Custom notes <span class="muted">(e.g. "use animal names")</span></label>
      <textarea id="genNotes" placeholder="Optional — anything specific you want this worksheet to do."></textarea>
    </div>
  `;
}

function renderTemplateModifiers(template) {
  return template.modifiers.map(m => {
    if (m.type === "select") {
      return `
        <div class="form-group">
          <label>${escapeHtml(m.label)}</label>
          <select data-mod-id="${m.id}">
            ${m.options.map(o => `<option value="${o.value}" ${o.value === m.default ? "selected" : ""}>${escapeHtml(o.label)}</option>`).join("")}
          </select>
        </div>
      `;
    }
    if (m.type === "number") {
      return `
        <div class="form-group">
          <label>${escapeHtml(m.label)}</label>
          <input type="number" data-mod-id="${m.id}" min="${m.min || 1}" max="${m.max || 100}" value="${m.default}" />
        </div>
      `;
    }
    if (m.type === "text") {
      return `
        <div class="form-group">
          <label>${escapeHtml(m.label)}</label>
          <input type="text" data-mod-id="${m.id}" value="${escapeAttr(m.default || "")}" />
        </div>
      `;
    }
    if (m.type === "boolean") {
      return `
        <div class="form-group" style="display:flex; align-items:center; gap:0.5rem;">
          <input type="checkbox" data-mod-id="${m.id}" ${m.default ? "checked" : ""} id="mod_${m.id}" style="width:auto;" />
          <label for="mod_${m.id}" style="margin:0;">${escapeHtml(m.label)}</label>
        </div>
      `;
    }
    if (m.type === "shape_picker") {
      const def = m.default || {};
      return `
        <div class="form-group">
          <label>${escapeHtml(m.label)}</label>
          <div class="letter-picker" data-mod-id="${m.id}">
            <div style="display: flex; flex-wrap: wrap; gap: 6px;">
              ${m.shapes.map(shapeId => {
                const shape = window.SHAPES[shapeId];
                if (!shape) return "";
                const rows = def[shapeId] || 0;
                return `<button type="button" class="letter-chip shape-chip ${rows > 0 ? "selected" : ""}" data-char="${shapeId}" data-rows="${rows}" title="${escapeHtml(shape.label)}">
                  <svg width="22" height="22" viewBox="0 0 24 24" style="display:block; color: currentColor;">${shape.icon}</svg>
                  <span class="chip-badge" ${rows > 0 ? "" : "style='display:none;'"}>${rows}</span>
                </button>`;
              }).join("")}
            </div>
          </div>
          <div style="display: flex; gap: 0.4rem; margin-top: 0.4rem;">
            <button type="button" class="btn btn-ghost" data-picker-action="all-1" data-picker-id="${m.id}" style="font-size: 0.78rem; padding: 0.3rem 0.6rem;">Set all selected → 1 row</button>
            <button type="button" class="btn btn-ghost" data-picker-action="clear" data-picker-id="${m.id}" style="font-size: 0.78rem; padding: 0.3rem 0.6rem;">Clear all</button>
            <span class="muted" style="font-size: 0.78rem; align-self: center; margin-left: auto;" id="pickerCount_${m.id}">0 shapes / 0 rows total</span>
          </div>
        </div>
      `;
    }
    if (m.type === "letter_picker") {
      const def = m.default || {};
      return `
        <div class="form-group">
          <label>${escapeHtml(m.label)}</label>
          <div class="letter-picker" data-mod-id="${m.id}">
            ${m.groups.map(g => `
              <div style="margin-bottom: 0.7rem;">
                <div class="muted" style="margin-bottom: 0.3rem; font-weight: 500;">${escapeHtml(g.label)}</div>
                <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                  ${g.chars.map(c => {
                    const rows = def[c] || 0;
                    return `<button type="button" class="letter-chip ${rows > 0 ? "selected" : ""}" data-char="${escapeAttr(c)}" data-rows="${rows}" title="Click to add rows (cycles 1→2→3→4→0)">
                      <span class="chip-char">${escapeHtml(c)}</span>
                      <span class="chip-badge" ${rows > 0 ? "" : "style='display:none;'"}>${rows}</span>
                    </button>`;
                  }).join("")}
                </div>
              </div>
            `).join("")}
          </div>
          <div style="display: flex; gap: 0.4rem; margin-top: 0.4rem;">
            <button type="button" class="btn btn-ghost" data-picker-action="all-1" data-picker-id="${m.id}" style="font-size: 0.78rem; padding: 0.3rem 0.6rem;">Set all selected → 1 row</button>
            <button type="button" class="btn btn-ghost" data-picker-action="clear" data-picker-id="${m.id}" style="font-size: 0.78rem; padding: 0.3rem 0.6rem;">Clear all</button>
            <span class="muted" style="font-size: 0.78rem; align-self: center; margin-left: auto;" id="pickerCount_${m.id}">0 letters / 0 rows total</span>
          </div>
        </div>
      `;
    }
    return "";
  }).join("");
}

function attachSubjectListeners(kid, subject) {
  document.getElementById("generateBtn").addEventListener("click", () => generateWorksheet(kid, subject));
  document.getElementById("uploadGradeBtn").addEventListener("click", () => openGradeModal());
  const picker = document.getElementById("templatePicker");
  if (picker) {
    picker.addEventListener("change", (e) => {
      uiTemplate[subject] = e.target.value;
      renderContent();
    });
  }
  document.querySelectorAll("[data-action='open']").forEach(el => {
    el.addEventListener("click", () => openWorksheetModal(el.dataset.worksheetId));
  });
  document.querySelectorAll("[data-action='grade']").forEach(el => {
    el.addEventListener("click", () => openGradeModal(el.dataset.worksheetId));
  });
  document.querySelectorAll("[data-action='del-ws']").forEach(el => {
    el.addEventListener("click", () => deleteWorksheet(el.dataset.worksheetId));
  });

  // Letter picker chips
  document.querySelectorAll(".letter-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      let rows = parseInt(chip.dataset.rows, 10) || 0;
      rows = (rows + 1) % 5; // 0 → 1 → 2 → 3 → 4 → 0
      chip.dataset.rows = rows;
      chip.classList.toggle("selected", rows > 0);
      const badge = chip.querySelector(".chip-badge");
      if (badge) {
        badge.textContent = rows;
        badge.style.display = rows > 0 ? "" : "none";
      }
      updateLetterPickerCount(chip.closest(".letter-picker"));
    });
  });
  document.querySelectorAll("[data-picker-action]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.pickerId;
      const wrap = document.querySelector(`.letter-picker[data-mod-id="${id}"]`);
      if (!wrap) return;
      const action = btn.dataset.pickerAction;
      wrap.querySelectorAll(".letter-chip").forEach(chip => {
        let rows = parseInt(chip.dataset.rows, 10) || 0;
        if (action === "clear") rows = 0;
        else if (action === "all-1") rows = rows > 0 ? 1 : 0;
        chip.dataset.rows = rows;
        chip.classList.toggle("selected", rows > 0);
        const badge = chip.querySelector(".chip-badge");
        if (badge) { badge.textContent = rows; badge.style.display = rows > 0 ? "" : "none"; }
      });
      updateLetterPickerCount(wrap);
    });
  });
  // Initial count
  document.querySelectorAll(".letter-picker").forEach(wrap => updateLetterPickerCount(wrap));

  // Reference photo upload/delete
  const refInput = document.getElementById("refFileInput");
  if (refInput) {
    refInput.addEventListener("change", (e) => handleReferenceUpload(kid, subject, e.target.files));
  }
  const refDrop = document.getElementById("refDropZone");
  if (refDrop) {
    refDrop.addEventListener("dragover", (e) => { e.preventDefault(); refDrop.classList.add("dragover"); });
    refDrop.addEventListener("dragleave", () => refDrop.classList.remove("dragover"));
    refDrop.addEventListener("drop", (e) => {
      e.preventDefault();
      refDrop.classList.remove("dragover");
      handleReferenceUpload(kid, subject, e.dataTransfer.files);
    });
  }
  document.querySelectorAll("[data-action='del-ref']").forEach(el => {
    el.addEventListener("click", () => deleteReference(kid, subject, el.dataset.refId));
  });
}

async function handleReferenceUpload(kid, subject, fileList) {
  if (!fileList || !fileList.length) return;
  const files = Array.from(fileList).filter(f => f.type.startsWith("image/"));
  if (!files.length) { toast("Only image files supported", "error"); return; }

  toast(`Uploading ${files.length} reference${files.length > 1 ? "s" : ""}…`);
  let added = 0;
  for (const file of files) {
    try {
      const dataUrl = await resizeImageToDataUrl(file, 1024, 0.85);
      const ref = {
        id: "ref_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
        dataUrl,
        label: file.name.replace(/\.[^/.]+$/, "").slice(0, 30),
        createdAt: Date.now()
      };
      if (!state.kids[kid.id].references) state.kids[kid.id].references = { math: [], reading: [], writing: [] };
      if (!state.kids[kid.id].references[subject]) state.kids[kid.id].references[subject] = [];
      state.kids[kid.id].references[subject].push(ref);
      added++;
    } catch (e) {
      console.error("Failed to add reference", e);
      toast("Couldn't add " + file.name + ": " + e.message, "error");
    }
  }
  // Try to save; if quota exceeded, undo last adds
  try {
    saveState();
    toast(`Added ${added} reference photo${added !== 1 ? "s" : ""}`, "success");
  } catch (e) {
    toast("Storage full — try removing older references", "error");
  }
  renderContent();
}

function deleteReference(kid, subject, refId) {
  state.kids[kid.id].references[subject] = state.kids[kid.id].references[subject].filter(r => r.id !== refId);
  saveState();
  renderContent();
}

function updateLetterPickerCount(wrap) {
  if (!wrap) return;
  const id = wrap.dataset.modId;
  const countEl = document.getElementById("pickerCount_" + id);
  if (!countEl) return;
  let letters = 0, rows = 0;
  wrap.querySelectorAll(".letter-chip").forEach(chip => {
    const r = parseInt(chip.dataset.rows, 10) || 0;
    if (r > 0) { letters++; rows += r; }
  });
  countEl.textContent = `${letters} letter${letters !== 1 ? "s" : ""} / ${rows} row${rows !== 1 ? "s" : ""} total`;
}

function deleteWorksheet(worksheetId) {
  const ws = findWorksheet(worksheetId);
  if (!ws) return;
  if (!confirm(`Delete "${ws.title}"?\n\nThis also removes any related gradings.`)) return;
  state.worksheets[ws.kidId] = state.worksheets[ws.kidId].filter(w => w.id !== worksheetId);
  // Cascade: also remove any gradings tied to this worksheet
  state.gradings[ws.kidId] = (state.gradings[ws.kidId] || []).filter(g => g.worksheetId !== worksheetId);
  saveState();
  toast("Worksheet deleted", "success");
  renderContent();
}

function resizeImageToDataUrl(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = Math.round(height * maxDim / width); width = maxDim; }
          else { width = Math.round(width * maxDim / height); height = maxDim; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height); // flatten transparency
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve(dataUrl);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function subjectLabel(s) {
  return s === "math" ? "Math" : s === "reading" ? "Reading" : "Writing";
}

function getCurriculumForKid(kid, subject) {
  if (subject === "math") return window.CURRICULUM.math[kid.gradeKey];
  return window.CURRICULUM.ela[kid.gradeKey]; // reading + writing share ELA
}

function getTopicsForSubject(curriculum, subject) {
  // Filter ELA content into reading vs writing buckets
  const items = curriculum.content;
  let filtered;
  if (subject === "reading") {
    filtered = items.filter(i => ["Story","Reading","Vocabulary","Phonics","Print"].includes(i.topic));
  } else if (subject === "writing") {
    filtered = items.filter(i => ["Writing","Handwriting","Grammar","Conventions","Letters"].includes(i.topic));
  } else {
    filtered = items;
  }
  return filtered.map(i => ({ id: i.id, label: i.topic + " — " + i.text }));
}

/* ============================================================
   WORKSHEET GENERATION
============================================================ */
async function generateWorksheet(kid, subject) {
  const generateBtn = document.getElementById("generateBtn");
  const wasLabel = generateBtn.innerHTML;
  generateBtn.disabled = true;
  generateBtn.innerHTML = '<span class="spinner"></span> Generating…';

  try {
    const templateId = uiTemplate[subject];
    const template = window.TEMPLATES[templateId];
    const isGenericAiMode = templateId === "__ai__" || !template;

    let worksheet;
    if (isGenericAiMode) {
      // Original open-ended AI flow — Mike types a prompt
      const topicId = document.getElementById("genTopic").value;
      const count = parseInt(document.getElementById("genCount").value, 10) || 10;
      const difficulty = parseInt(document.getElementById("genDifficulty").value, 10) || kid.difficulty[subject];
      const notes = document.getElementById("genNotes").value.trim();
      worksheet = await callClaudeForWorksheet({ kid, subject, topicId, count, difficulty, notes });
    } else if (template.usesAI) {
      // Structured AI template — modifiers feed buildPrompt, response feeds renderPDF
      worksheet = await generateFromAITemplate(kid, subject, template);
    } else {
      worksheet = generateFromTemplate(kid, subject, templateId);
    }

    // DON'T save yet — only save when user downloads (signals they're actually using it)
    worksheet._unsaved = true;
    openWorksheetModal(worksheet);
    toast("Worksheet ready — preview below. It will save to your list when you download.", "success");
  } catch (e) {
    console.error(e);
    toast("Worksheet generation failed: " + e.message, "error");
  } finally {
    generateBtn.disabled = false;
    generateBtn.innerHTML = wasLabel || "📄 Generate worksheet";
  }
}

// Read modifier values from the rendered form. Shared between template
// and AI-template flows so both pick up text/select/boolean/pickers the same way.
function readModifiersFromForm(template) {
  const mods = {};
  template.modifiers.forEach(m => {
    if (m.type === "letter_picker" || m.type === "shape_picker") {
      const wrap = document.querySelector(`.letter-picker[data-mod-id="${m.id}"]`);
      const selection = {};
      if (wrap) {
        wrap.querySelectorAll(".letter-chip").forEach(chip => {
          const rows = parseInt(chip.dataset.rows, 10) || 0;
          if (rows > 0) selection[chip.dataset.char] = rows;
        });
      }
      mods[m.id] = selection;
      return;
    }
    const el = document.querySelector(`[data-mod-id="${m.id}"]`);
    if (!el) { mods[m.id] = m.default; return; }
    if (m.type === "boolean") mods[m.id] = el.checked;
    else mods[m.id] = el.value;
  });
  return mods;
}

function generateFromTemplate(kid, subject, templateId) {
  const template = window.TEMPLATES[templateId];
  const mods = readModifiersFromForm(template);
  const content = template.generate(mods);
  return {
    id: "ws_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
    kidId: kid.id,
    subject,
    templateId: template.id,
    modifiers: mods,
    content,
    title: titleFromTemplate(template, mods, kid),
    standards: [], // could enrich via template.topicHint mapping later
    questions: contentToQuestions(content, template), // for legacy display + grading
    answerKey: contentToAnswers(content, template),
    difficulty: kid.difficulty[subject],
    notes: "",
    generatedAt: Date.now()
  };
}

/* ============================================================
   AI-TEMPLATE FLOW
   Structured template that routes through Claude. Same UI as
   regular templates, just with a buildPrompt + parseResponse.
============================================================ */
async function generateFromAITemplate(kid, subject, template) {
  const mods = readModifiersFromForm(template);
  const prompt = template.buildPrompt(mods, kid);

  // Optional reference photos attached as vision input (same as the open-ended AI mode)
  const refs = (kid.references && kid.references[subject]) || [];
  let responseText;
  if (state.settings.apiKey) {
    if (refs.length > 0 && template.acceptsReferences !== false) {
      const content = [];
      content.push({ type: "text", text: `Below are ${refs.length} reference worksheet${refs.length > 1 ? "s" : ""} that show the style I want you to match:` });
      refs.slice(0, 5).forEach(r => {
        const match = r.dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
        if (match) {
          content.push({ type: "image", source: { type: "base64", media_type: match[1], data: match[2] } });
        }
      });
      content.push({ type: "text", text: prompt });
      responseText = await callClaudeAPI(null, { content, max_tokens: template.maxTokens || 4096 });
    } else {
      responseText = await callClaudeAPI(prompt, { max_tokens: template.maxTokens || 4096 });
    }
  } else if (typeof template.mockResponse === "function") {
    responseText = template.mockResponse(mods, kid);
  } else {
    throw new Error("This template needs a Claude API key. Add one in Settings, then try again.");
  }

  const content = template.parseResponse(responseText);
  const title = (template.titleFrom && template.titleFrom(content, mods, kid)) || content.title || template.label;
  return {
    id: "ws_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
    kidId: kid.id,
    subject,
    templateId: template.id,
    modifiers: mods,
    content,
    title,
    standards: content.standards || [],
    questions: content.questions || [],
    answerKey: (content.questions || []).map(q => q.answer || ""),
    difficulty: kid.difficulty[subject],
    notes: "",
    referencesUsed: refs.length,
    generatedAt: Date.now()
  };
}

function titleFromTemplate(template, m, kid) {
  // Build a descriptive title from modifiers
  if (template.id === "vertical_arithmetic") {
    const op = m.operation === "addition" ? "Adding" : m.operation === "subtraction" ? "Subtracting" : "Adding & Subtracting";
    const digits = ["", "One", "Two", "Three", "Four"][parseInt(m.digits, 10)];
    const stack = m.stackHeight === "2" ? "" : (m.stackHeight + " ");
    const regroup = m.regrouping === "yes" ? " with Regrouping" : m.regrouping === "no" ? " (No Regrouping)" : "";
    return `${op} ${stack}${digits}-Digit Numbers${regroup}`;
  }
  if (template.id === "place_value_expanded") {
    return parseInt(m.digits, 10) === 2 ? "Tens and Ones"
         : parseInt(m.digits, 10) === 3 ? "Hundreds, Tens, and Ones"
         : "Thousands, Hundreds, Tens, and Ones";
  }
  if (template.id === "tracing_letters_numbers") {
    return m.mode === "uppercase" ? "Tracing Uppercase Letters"
         : m.mode === "lowercase" ? "Tracing Lowercase Letters"
         : m.mode === "uppercase_lowercase" ? "Tracing Letters (Both Cases)"
         : m.mode === "numbers" ? "Tracing Numbers 0–9"
         : m.mode === "name" ? `Tracing ${kid?.name || ""}'s Name`
         : "Tracing Practice";
  }
  if (template.id === "tracing_shapes") {
    return `Shape Tracing — ${kid?.name || ""}`;
  }
  return template.label;
}

function contentToQuestions(content, template) {
  // Flatten template content into a generic question list (for legacy display + grading)
  if (template.id === "vertical_arithmetic") {
    return content.problems.map(p => ({
      q: p.numbers.join(` ${p.op} `) + " = ___",
      answer: String(p.answer),
      type: "fill_in"
    }));
  }
  if (template.id === "balance_equations") {
    return content.problems.map(p => {
      const unk = p.unknownSide === "left" ? p.left[p.unknownPos] : p.right[p.unknownPos];
      const eqStr = `${p.left.join(" + ")} = ${p.right.join(" + ")}`;
      return { q: eqStr + " (find the missing number)", answer: String(unk), type: "fill_in" };
    });
  }
  if (template.id === "number_order") {
    return content.problems.map(p => ({
      q: `Order from least to greatest: ${p.numbers.join(", ")}`,
      answer: p.sorted.join(", "),
      type: "short_response"
    }));
  }
  if (template.id === "add_subtract_10") {
    return [...(content.adds || []), ...(content.subs || [])].map(p => ({
      q: `${p.a} ${p.op} 10 = ___`,
      answer: String(p.answer),
      type: "fill_in"
    }));
  }
  if (template.id === "place_value_expanded") {
    return content.numbers.map(n => ({
      q: `Break ${n} into hundreds, tens, ones; write expanded form`,
      answer: String(n),
      type: "short_response"
    }));
  }
  if (template.id === "tracing_letters_numbers") {
    return (content.items || []).map(ch => ({
      q: `Trace: ${ch}`,
      answer: ch,
      type: "trace"
    }));
  }
  if (template.id === "tracing_shapes") {
    return (content.items || []).map(s => ({
      q: `Trace shape: ${window.SHAPES[s]?.label || s}`,
      answer: s,
      type: "trace"
    }));
  }
  return [];
}

function contentToAnswers(content, template) {
  return contentToQuestions(content, template).map(q => q.answer);
}

/* ============================================================
   RE-TEACH FROM GRADING
   Takes a graded worksheet + its grading result and generates a
   fresh, targeted practice worksheet focused on what the kid missed.
   Produces a generic AI-worksheet object (no templateId) so it
   renders through the existing question-list preview + PDF path.
============================================================ */
async function generateReteachWorksheet(kid, sourceWorksheet, grading) {
  const prompt = buildReteachPrompt(kid, sourceWorksheet, grading);

  let responseText;
  if (state.settings.apiKey) {
    responseText = await callClaudeAPI(prompt, { max_tokens: 2500 });
  } else {
    responseText = mockReteachResponse(kid, sourceWorksheet, grading);
  }

  const parsed = parseWorksheetJSON(responseText);
  const questions = (parsed.questions || []).map(q => ({
    q: q.q || q.question || "",
    answer: q.answer != null ? String(q.answer) : "",
    type: q.type || "short_response"
  }));

  return {
    id: "ws_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
    kidId: kid.id,
    subject: sourceWorksheet ? sourceWorksheet.subject : state.currentTab,
    // No templateId → renders via the generic question-list path
    title: parsed.title || "Practice: Try Again",
    instructions: parsed.instructions || "Let's practice the tricky ones again. Take your time!",
    questions,
    answerKey: questions.map(q => q.answer),
    standards: parsed.standards || (sourceWorksheet ? sourceWorksheet.standards : []) || [],
    difficulty: kid.difficulty[sourceWorksheet ? sourceWorksheet.subject : "math"],
    reteachOf: sourceWorksheet ? sourceWorksheet.id : null,
    notes: "Re-teach worksheet generated from a graded result.",
    generatedAt: Date.now()
  };
}

function buildReteachPrompt(kid, sourceWorksheet, grading) {
  const subject = sourceWorksheet ? sourceWorksheet.subject : "this subject";

  // Identify the specific questions the child missed.
  let missed = [];
  if (sourceWorksheet && Array.isArray(grading.perQuestion)) {
    grading.perQuestion.forEach((pq, i) => {
      const q = sourceWorksheet.questions && sourceWorksheet.questions[i];
      if (q && pq && pq.correct === false) {
        missed.push(`"${q.q}" (correct answer: ${q.answer}${pq.kidAnswer ? `; child wrote: ${pq.kidAnswer}` : ""})`);
      }
    });
  }
  const missedBlock = missed.length
    ? `The child specifically got these wrong:\n- ${missed.join("\n- ")}\n`
    : "The child scored below mastery on this worksheet; rebuild practice on the same skills.\n";

  const weakStd = (grading.weakStandards && grading.weakStandards.length)
    ? `Weak BC standards flagged: ${grading.weakStandards.join(", ")}.`
    : "";

  const ease = grading.recommendation === "easier"
    ? "Make this set NOTICEABLY EASIER — smaller numbers / simpler wording / more scaffolding."
    : "Keep it at the SAME level but approach the skill from a fresh angle (new examples, slightly different phrasing).";

  return `You are a BC-curriculum tutor creating a targeted re-teach worksheet for a homeschooled child who just struggled with some problems.

CHILD: ${kid.name}, age ${kid.age}, ${gradeWord(kid)} level.
SUBJECT: ${subject}
ORIGINAL WORKSHEET: ${sourceWorksheet ? sourceWorksheet.title : "(unknown)"}
SCORE: ${grading.score}%  •  RECOMMENDATION: ${grading.recommendation}
${weakStd}

${missedBlock}
GOAL: Generate 6–8 fresh practice questions that rebuild confidence on exactly these skills.
${ease}
- Start with the 2 easiest to build a quick win, then increase gently.
- Use ${kid.name}'s name and interests (${kid.interests || "everyday topics"}) to keep it engaging.
- Each question must be answerable on paper.

RETURN VALID JSON ONLY (no markdown fences):
{
  "title": "Practice Again: <short skill label>",
  "instructions": "<one warm, short instruction line>",
  "questions": [
    { "q": "<question>", "answer": "<correct answer>", "type": "<fill_in|short_response>" }
  ],
  "standards": ["<BC standard id>"]
}`;
}

function mockReteachResponse(kid, sourceWorksheet, grading) {
  const name = kid.name || "friend";
  return JSON.stringify({
    title: "Practice Again: Tricky Ones",
    instructions: `Nice try, ${name}! Let's practice these a little more. Take your time.`,
    questions: [
      { q: "Warm-up: 6 + 3 = ___", answer: "9", type: "fill_in" },
      { q: "Warm-up: 10 − 4 = ___", answer: "6", type: "fill_in" },
      { q: `${name} has 7 marbles and finds 6 more. How many now?`, answer: "13", type: "short_response" },
      { q: "There are 15 apples. 8 are eaten. How many are left?", answer: "7", type: "short_response" },
      { q: "Fill in: 9 + ___ = 16", answer: "7", type: "fill_in" },
      { q: "A box holds 4 crayons. How many crayons in 3 boxes?", answer: "12", type: "short_response" }
    ],
    standards: (sourceWorksheet && sourceWorksheet.standards) || ["M3.3"]
  });
}

/* ============================================================
   CLAUDE API WRAPPER
   - Real API call if apiKey is set
   - Otherwise returns mock data so the app is fully testable
============================================================ */
async function callClaudeForWorksheet({ kid, subject, topicId, count, difficulty, notes }) {
  const curriculum = getCurriculumForKid(kid, subject);
  const standard = topicId ? curriculum.content.find(c => c.id === topicId) : null;
  const standardText = standard ? `${standard.id}: ${standard.text}` : "Auto-select based on the student's profile.";

  const refs = (kid.references && kid.references[subject]) || [];
  const prompt = buildWorksheetPrompt({ kid, subject, standardText, count, difficulty, notes, hasReferences: refs.length > 0 });

  let response;
  if (state.settings.apiKey) {
    if (refs.length > 0) {
      // Vision call: attach reference images plus the prompt
      const content = [];
      content.push({ type: "text", text: `Below are ${refs.length} reference worksheet${refs.length > 1 ? "s" : ""} that show the style, format, and difficulty calibration I want you to match:` });
      refs.slice(0, 5).forEach(r => {
        const match = r.dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
        if (match) {
          content.push({ type: "image", source: { type: "base64", media_type: match[1], data: match[2] } });
        }
      });
      content.push({ type: "text", text: prompt });
      response = await callClaudeAPI(null, { content, max_tokens: 4096 });
    } else {
      response = await callClaudeAPI(prompt, { max_tokens: 4096 });
    }
  } else {
    response = mockWorksheetResponse({ kid, subject, standard, count, difficulty });
  }

  // Parse JSON from response
  const parsed = parseWorksheetJSON(response);
  return {
    id: "ws_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
    kidId: kid.id,
    subject,
    topicId: topicId || null,
    standards: parsed.standards || (standard ? [standard.id] : []),
    title: parsed.title,
    instructions: parsed.instructions,
    questions: parsed.questions,
    answerKey: parsed.questions.map(q => q.answer || ""),
    difficulty,
    notes,
    referencesUsed: refs.length,
    generatedAt: Date.now()
  };
}

function buildWorksheetPrompt({ kid, subject, standardText, count, difficulty, notes, hasReferences }) {
  const isPreK = kid.gradeKey === "K" && kid.age < 5;
  return `You are a BC-curriculum-aligned worksheet generator for a homeschooled child.

CHILD: ${kid.name}, age ${kid.age}, ${kid.gradeKey === "K" ? "Kindergarten" : "Grade " + kid.gradeKey} level${isPreK ? " (Pre-K bridge — keep it gentle and playful)" : ""}.
INTERESTS: ${kid.interests || "general"}
PARENT NOTES: ${kid.notes || "none"}

SUBJECT: ${subject}
TARGET BC LEARNING STANDARD: ${standardText}
DIFFICULTY (1=easiest, 10=hardest within this grade): ${difficulty}
NUMBER OF QUESTIONS: ${count}
CUSTOM NOTES FROM PARENT: ${notes || "none"}

${hasReferences ? `STYLE REFERENCES: I have attached reference worksheets above. Match their:
- Question format and wording style
- Visual layout cues (e.g., stacked vertical math, fill-in-the-blank boxes, multi-part prompts)
- Difficulty calibration and number of questions per section
- Tone and instruction phrasing
Generate fresh questions in the SAME style as those references, never copy their exact problems.

` : ""}Return ONLY valid JSON with this exact shape (no markdown, no commentary):
{
  "title": "<short title>",
  "instructions": "<one or two sentence instructions for the child>",
  "standards": ["<BC standard id>"],
  "questions": [
    { "q": "<question text>", "answer": "<correct answer>", "type": "<fill_in|multiple_choice|short_response|trace|draw>" }
  ]
}

GUIDELINES:
- Calibrate to BC curriculum for ${kid.gradeKey === "K" ? "Kindergarten" : "Grade " + kid.gradeKey}.
- For age 4 (Pre-K bridge), favor tracing, matching, picture-based questions.
- For age 6 (Grade 1), favor short, concrete questions with visual or sentence-level scaffolding.
- For age 8 (Grade 3), allow short word problems and multi-step thinking.
- Questions should be printable on paper — avoid relying on color, audio, or interactivity.
- If subject is "writing", focus on letter formation, sentence building, or short paragraph prompts depending on grade.
- If subject is "reading", include a short passage if appropriate, followed by questions.
- Difficulty 1-3 = easier than grade average; 4-6 = grade average; 7-10 = stretch.`;
}

async function callClaudeAPI(userPrompt, options = {}) {
  const apiKey = state.settings.apiKey;
  if (!apiKey) throw new Error("No API key set");

  const body = {
    model: state.settings.model || "claude-sonnet-4-6",
    max_tokens: options.max_tokens || 4096,
    messages: [
      { role: "user", content: options.content || userPrompt }
    ]
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error("Claude API error " + res.status + ": " + txt);
  }
  const data = await res.json();
  return data.content?.[0]?.text || "";
}

function parseWorksheetJSON(text) {
  // Try to extract JSON from response (in case model wrapped in code fences)
  const cleaned = text.replace(/^```json\n?|```$/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Try to find first { ... } block
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch (e2) {}
    }
    throw new Error("Could not parse worksheet JSON from response");
  }
}

/* ------------------------------ MOCK GENERATOR (no API key) */
function mockWorksheetResponse({ kid, subject, standard, count, difficulty }) {
  const grade = kid.gradeKey;
  const standardText = standard ? standard.text : "general practice";
  let questions = [];

  if (subject === "math") {
    if (grade === "K") {
      // simple counting / addition within 5
      for (let i = 0; i < count; i++) {
        const a = Math.floor(Math.random() * 5);
        const b = Math.floor(Math.random() * (5 - a));
        questions.push({ q: `Count the objects: ${"🐸".repeat(a + b)} = ___`, answer: String(a + b), type: "fill_in" });
      }
    } else if (grade === "1") {
      // addition/subtraction within 20
      for (let i = 0; i < count; i++) {
        const a = Math.floor(Math.random() * 15) + 1;
        const b = Math.floor(Math.random() * Math.min(20 - a, 10)) + 1;
        const op = Math.random() < 0.5 ? "+" : "-";
        const [x, y] = op === "+" ? [a, b] : [a + b, b];
        questions.push({ q: `${x} ${op} ${y} = ___`, answer: String(op === "+" ? x + y : x - y), type: "fill_in" });
      }
    } else {
      // grade 3: mix of multi-digit + multiplication
      for (let i = 0; i < count; i++) {
        const kind = Math.random();
        if (kind < 0.5) {
          const a = Math.floor(Math.random() * 800) + 100;
          const b = Math.floor(Math.random() * 200) + 50;
          const op = Math.random() < 0.5 ? "+" : "-";
          const [x, y] = op === "+" ? [a, b] : [Math.max(a, b), Math.min(a, b)];
          questions.push({ q: `${x} ${op} ${y} = ___`, answer: String(op === "+" ? x + y : x - y), type: "fill_in" });
        } else {
          const a = Math.floor(Math.random() * 9) + 2;
          const b = Math.floor(Math.random() * 9) + 2;
          questions.push({ q: `${a} × ${b} = ___`, answer: String(a * b), type: "fill_in" });
        }
      }
    }
  } else if (subject === "reading") {
    if (grade === "K") {
      const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
      for (let i = 0; i < count; i++) {
        const l = letters[Math.floor(Math.random() * 26)];
        questions.push({ q: `What sound does the letter "${l}" make? Say it out loud.`, answer: l + " sound", type: "short_response" });
      }
    } else if (grade === "1") {
      const sights = ["the","and","you","said","was","with","they","have","this","from"];
      for (let i = 0; i < count; i++) {
        const w = sights[i % sights.length];
        questions.push({ q: `Use "${w}" in a sentence: _________________________`, answer: "Any sentence using '" + w + "'", type: "short_response" });
      }
    } else {
      questions.push({ q: `Read this passage and answer the questions below.\n\nThe black bear walked carefully along the river. She was looking for salmon. The fish were jumping in the water, glistening in the sun.\n\n1. Where was the bear walking?`, answer: "Along the river", type: "short_response" });
      for (let i = 1; i < count; i++) {
        questions.push({ q: `${i + 1}. ${["What was the bear looking for?","What were the fish doing?","Describe one word the author used to paint a picture.","Why might the bear be at the river?","What do you predict happens next?"][i % 5]}`, answer: "Open response", type: "short_response" });
      }
    }
  } else {
    // writing
    if (grade === "K") {
      const letters = "abcdefghij".split("");
      for (let i = 0; i < count; i++) {
        const l = letters[i % letters.length];
        questions.push({ q: `Trace and copy: ${l} ${l} ${l} ${l} ${l}     ____ ____ ____`, answer: "letter " + l, type: "trace" });
      }
    } else if (grade === "1") {
      for (let i = 0; i < count; i++) {
        questions.push({ q: `Finish the sentence: I love ____________ because ____________.`, answer: "Open response", type: "short_response" });
      }
    } else {
      questions = [
        { q: "Write a short paragraph (3–5 sentences) about your favourite season. Use one simile.", answer: "Open response", type: "short_response" },
        { q: "Use 'because' and 'but' in two sentences about your day.", answer: "Open response", type: "short_response" },
        { q: "Write three compound sentences about an animal you'd like to learn about.", answer: "Open response", type: "short_response" }
      ].slice(0, count);
      while (questions.length < count) {
        questions.push({ q: "Free write — tell me about something that happened this week.", answer: "Open response", type: "short_response" });
      }
    }
  }

  const titles = {
    math: { K: "Counting Critters", "1": "Adding Up", "3": "Number Power" },
    reading: { K: "Letter Sounds", "1": "Sight Word Stories", "3": "River Reading" },
    writing: { K: "Trace & Write", "1": "Sentence Builders", "3": "Paragraph Practice" }
  };
  const titleBase = titles[subject][grade] || "Practice";
  const json = {
    title: `${titleBase} — ${kid.name}`,
    instructions: `Complete the ${count} questions below. Take your time and do your best work!`,
    standards: standard ? [standard.id] : [],
    questions: questions.slice(0, count)
  };
  return JSON.stringify(json);
}

/* ============================================================
   WORKSHEET MODAL + PDF
============================================================ */
let currentWorksheetForModal = null;

/* ============================================================
   HTML PREVIEW RENDERERS (mirror the PDF layout for each template)
============================================================ */
function renderTemplatePreviewHTML(ws) {
  const content = ws.content;
  if (ws.templateId === "vertical_arithmetic") return previewVerticalArithmetic(content, ws.modifiers);
  if (ws.templateId === "balance_equations")   return previewBalanceEquations(content, ws.modifiers);
  if (ws.templateId === "number_order")        return previewNumberOrder(content, ws.modifiers);
  if (ws.templateId === "add_subtract_10")     return previewAddSubtract10(content, ws.modifiers);
  if (ws.templateId === "place_value_expanded") return previewPlaceValue(content, ws.modifiers);
  if (ws.templateId === "tracing_letters_numbers") return previewTracing(content, ws.modifiers, ws.kidId);
  if (ws.templateId === "tracing_words") return previewTracingWords(content, ws.modifiers);
  if (ws.templateId === "tracing_shapes") return previewTracingShapes(content, ws.modifiers);
  if (ws.templateId === "count_to_10") return previewCountTo10(content, ws.modifiers);
  if (ws.templateId === "ways_to_make") return previewWaysToMake(content, ws.modifiers);
  if (ws.templateId === "ab_patterns") return previewAbPatterns(content, ws.modifiers);
  if (ws.templateId === "multiplication_facts") return previewMultiplicationFacts(content, ws.modifiers);
  if (ws.templateId === "fractions_visual") return previewFractionsVisual(content, ws.modifiers);
  if (ws.templateId === "time_telling") return previewTimeTelling(content, ws.modifiers);
  if (ws.templateId === "sight_words_practice") return previewSightWords(content, ws.modifiers);
  if (ws.templateId === "reading_passage_gr3") return previewReadingPassage(content, ws.modifiers);
  if (ws.templateId === "capitalize_questions") return previewCapitalizeQuestions(content, ws.modifiers);
  if (ws.templateId === "story_middle_end") return previewStoryMiddleEnd(content, ws.modifiers);
  if (ws.templateId === "combine_sentences") return previewCombineSentences(content, ws.modifiers);
  if (ws.templateId === "describing_words_fill") return previewDescribingFill(content, ws.modifiers);
  if (ws.templateId === "describing_words_choose") return previewDescribingChoose(content, ws.modifiers);
  if (ws.templateId === "math_word_problems") return previewMathWordProblems(content, ws.modifiers);
  if (ws.templateId === "spelling_with_sentences") return previewSpelling(content, ws.modifiers);
  if (ws.templateId === "story_starters") return previewStoryStarters(content, ws.modifiers);
  return "<p class='muted'>Preview not available for this template — but the PDF will render correctly.</p>";
}

function previewMathWordProblems(content, m) {
  const showWork = m.showWorkSpace !== false;
  const items = (content.problems || []).map((p, i) => `
    <div style="padding: 12px 0; border-bottom: 1px dashed #ddd;">
      <div style="display:flex; align-items:flex-start; gap:8px;">
        ${scholasticDotHTML(String(i + 1))}
        <span style="font-size: 14px;">${escapeHtml(p.problem)}</span>
      </div>
      ${showWork ? `<div style="margin: 8px 0 8px 30px; border: 1px solid #bbb; border-radius: 3px; height: 40px; color:#bbb; font-size: 10px; padding: 3px 6px;">work space</div>` : ""}
      <div style="margin-left: 30px; font-size: 13px;"><strong>Answer:</strong> <span style="display:inline-block; border-bottom: 1.5px solid #222; width: 200px; height: 18px;"></span></div>
    </div>
  `).join("");
  return `
    ${content.instructions ? `<p style="margin: 0 0 10px;"><em>${escapeHtml(content.instructions)}</em></p>` : ""}
    ${items}
  `;
}

function previewSpelling(content, m) {
  const words = content.words || [];
  const writeTimes = parseInt(m.writeWordTimes, 10) || 0;
  const listHTML = `
    <div style="background:#e8f0f4; border-radius:6px; padding: 10px 14px; margin-bottom: 14px;">
      <div style="font-weight:bold; margin-bottom:6px;">This week's words</div>
      <div style="columns: 2; font-size: 14px;">
        ${words.map((w, i) => `<div>${i + 1}. ${escapeHtml(w.word)}</div>`).join("")}
      </div>
    </div>`;
  const items = words.map((w, i) => `
    <div style="padding: 10px 0; border-bottom: 1px dashed #eee;">
      <div style="display:flex; align-items:center; gap:8px;">${scholasticDotHTML(String(i + 1))}<strong style="font-size:15px;">${escapeHtml(w.word)}</strong></div>
      ${writeTimes > 0 ? `<div style="display:flex; gap: 12px; margin: 8px 0 8px 30px;">${Array.from({length: writeTimes}).map(() => `<span style="flex:1; border-bottom: 1px solid #aaa; height: 18px;"></span>`).join("")}</div>` : ""}
      <div style="margin-left: 30px; font-size: 12px; color:#666;">Use it in a sentence:</div>
      <div style="margin-left: 30px; border-bottom: 1.5px solid #222; height: 20px;"></div>
    </div>
  `).join("");
  return listHTML + items;
}

function previewStoryStarters(content, m) {
  const lines = parseInt(m.linesPerPrompt, 10) || 9;
  const previewLines = Math.min(lines, 5); // keep the on-screen preview compact
  return (content.prompts || []).map((p, i) => `
    <div style="margin-bottom: 18px;">
      <div style="background:#fff8eb; border-radius:6px; padding: 12px 14px; display:flex; gap:10px; align-items:flex-start;">
        ${scholasticDotHTML(String(i + 1))}
        <div>
          <div style="font-size: 14px; font-weight: 600;">${escapeHtml(p.prompt)}</div>
          ${(p.tryWords && p.tryWords.length) ? `<div style="font-size: 12px; color:#9a5a1e; font-style:italic; margin-top:4px;">Try to use: ${p.tryWords.map(escapeHtml).join(", ")}</div>` : ""}
        </div>
      </div>
      <div style="margin-top: 8px;">
        ${Array.from({length: previewLines}).map(() => `<div style="border-bottom: 1px solid #bbb; height: 20px;"></div>`).join("")}
        ${lines > previewLines ? `<div style="font-size: 11px; color:#aaa; text-align:center; margin-top:4px;">…${lines} lines total on the printed page</div>` : ""}
      </div>
    </div>
  `).join("");
}

/* -------- Scholastic-style previews -------- */

function scholasticHeaderHTML(category, title) {
  return `
    <div style="background: #4c2f6e; color: #fff; padding: 10px 16px; font-size: 12px; margin: -1rem -1rem 0; border-radius: 8px 8px 0 0;">${escapeHtml(category)}</div>
    <h2 style="color: #218282; font-family: Georgia, serif; margin: 12px 0 6px;">${escapeHtml(title)}</h2>
  `;
}
function scholasticDotHTML(label, color) {
  const c = color || "#e76938";
  return `<span style="display:inline-block; width:22px; height:22px; border-radius:50%; background:${c}; color:#fff; font-weight:bold; text-align:center; line-height:22px; font-size:13px; margin-right: 8px; vertical-align: middle;">${escapeHtml(label)}</span>`;
}
function scholasticHintBoxHTML(lines) {
  const innerLines = lines.map(line => {
    if (typeof line === "string") return line ? `<div>${escapeHtml(line)}</div>` : `<div>&nbsp;</div>`;
    return `<div style="font-weight:${line.bold ? "bold" : "normal"};">${escapeHtml(line.text)}</div>`;
  }).join("");
  return `<div style="background: #e8e2f0; padding: 10px 12px; border-radius: 8px; font-size: 12px; color: #2a2a2a;">${innerLines}</div>`;
}

function previewCapitalizeQuestions(content, m) {
  const hint = scholasticHintBoxHTML([
    "A sentence that asks",
    "a question ends with a",
    "question mark (?).",
    "It often begins with one of",
    "these words:",
    "",
    { text: "Who   What   Where   When", bold: true },
    { text: "Why   Will   Could   How", bold: true }
  ]);
  const items = content.problems.map((p, i) => `
    <div style="padding: 10px 0;">
      <div style="display:flex; align-items:center;">${scholasticDotHTML(String(i + 1))}<span style="font-size:14px;">${escapeHtml(p.raw)}</span></div>
      <div style="border-bottom: 1.5px solid #222; height: 24px; margin: 6px 0 0 30px;"></div>
    </div>
  `).join("");
  return `
    ${scholasticHeaderHTML("Capitalize/Punctuate questions", content.themeLabel)}
    <div style="display:flex; gap: 16px; align-items: flex-start; margin-bottom: 14px;">
      <p style="flex:1; margin: 0;">Rewrite the questions using capital letters and question marks.</p>
      <div style="width: 220px;">${hint}</div>
    </div>
    ${items}
  `;
}

function previewStoryMiddleEnd(content, m) {
  const items = content.problems.map(p => `
    <div style="padding: 14px 0;">
      <div style="display:flex; align-items:center; margin-bottom: 6px;">${scholasticDotHTML("B")}<span style="font-size:13px;">${escapeHtml(p.beginning)}</span></div>
      <div style="display:flex; align-items:center; margin-bottom: 10px;">${scholasticDotHTML("M", "#218282")}<strong style="margin-right: 4px;">Next,</strong><div style="flex:1; border-bottom: 1.5px solid #222; height: 22px;"></div></div>
      <div style="display:flex; align-items:center;">${scholasticDotHTML("E", "#218282")}<strong style="margin-right: 4px;">Last,</strong><div style="flex:1; border-bottom: 1.5px solid #222; height: 22px;"></div></div>
    </div>
  `).join("");
  return `
    ${scholasticHeaderHTML("Write the middle and end of stories", content.themeLabel)}
    <p style="margin: 0 0 14px;">Stories have a beginning <strong>(B)</strong>, a middle <strong>(M)</strong>, and an end <strong>(E)</strong>. Write a middle sentence that tells what happens next. Then write an ending sentence that tells what happens last.</p>
    ${items}
  `;
}

function previewCombineSentences(content, m) {
  const hint = scholasticHintBoxHTML([
    "Sentences can be combined",
    "to make them more",
    "interesting. A key word can",
    "tie two sentences together.",
    "",
    { text: "I will plan my garden.", bold: true },
    { text: "I am waiting for spring.", bold: true },
    "",
    "I will plan my garden while",
    "I am waiting for spring."
  ]);
  const items = content.problems.map((p, i) => `
    <div style="padding: 12px 0; display:grid; grid-template-columns: 30px 1fr 100px; gap: 8px; align-items: center;">
      ${scholasticDotHTML(String(i + 1))}
      <div style="font-size: 13px;">${escapeHtml(p.s1)} ${escapeHtml(p.s2)}</div>
      <div style="text-align:center;">
        <span style="display:inline-block; border:1.5px solid #e76938; color:#e76938; font-weight:bold; padding: 4px 14px; border-radius: 999px; font-size: 13px;">${escapeHtml(p.keyword)}</span>
      </div>
      <div></div>
      <div style="grid-column: 2 / span 2; border-bottom: 1.5px solid #222; height: 24px;"></div>
    </div>
  `).join("");
  return `
    ${scholasticHeaderHTML("Combine sentences", content.themeLabel)}
    <div style="display:flex; gap: 16px; align-items: flex-start; margin-bottom: 14px;">
      <p style="flex:1; margin: 0;">Combine the two sentences using the key word. Write a new sentence on the line.</p>
      <div style="width: 220px;">${hint}</div>
    </div>
    ${items}
  `;
}

function previewDescribingFill(content, m) {
  const items = content.problems.map((p, i) => {
    const parts = p.sentence.split("___");
    return `
      <div style="padding: 8px 0; display:flex; align-items:center;">
        ${scholasticDotHTML(String(i + 1))}
        <span style="font-size:14px;">
          ${escapeHtml(parts[0] || "")}
          <span style="display:inline-block; min-width: 100px; border-bottom: 1.5px solid #222; height: 18px; vertical-align: text-bottom; margin: 0 4px;"></span>
          ${escapeHtml(parts[1] || "")}
        </span>
      </div>
    `;
  }).join("");
  return `
    ${scholasticHeaderHTML("Write describing words", content.themeLabel)}
    <p style="margin: 0 0 14px;">Add a describing word to each sentence.</p>
    ${items}
  `;
}

function previewDescribingChoose(content, m) {
  const hint = scholasticHintBoxHTML([
    "Describing words give",
    "information about something",
    "we can discover with our",
    "senses."
  ]);
  const sentenceItems = content.problems.map((p, i) => `
    <div style="padding: 8px 0; display:flex; align-items:center;">
      ${scholasticDotHTML(String(i + 1))}
      <span style="font-size:14px;">
        ${escapeHtml(p.sentence)}
        <span style="display:inline-block; min-width: 90px; border-bottom: 1.5px solid #222; height: 18px; vertical-align: text-bottom; margin: 0 4px;"></span>.
      </span>
    </div>
  `).join("");
  const bankHTML = (title, words) => `
    <div style="background: #e8f0f4; padding: 10px 12px; border-radius: 6px; min-width: 100px;">
      <div style="font-weight: bold; text-align:center; border-bottom: 1px solid #888; padding-bottom: 4px; margin-bottom: 6px;">${escapeHtml(title)}</div>
      ${words.map(w => `<div style="text-align:center; font-size: 13px; padding: 3px 0; border-bottom: 1px dotted #aaa;">${escapeHtml(w)}</div>`).join("")}
    </div>
  `;
  let wsHTML = "";
  if (content.wordSearch) {
    const grid = content.wordSearch.grid;
    const cellSize = 26;
    wsHTML = `
      <hr style="border: none; border-top: 1.5px dotted #e76938; margin: 14px 0;"/>
      <p style="margin: 0 0 8px;">Look at the words in the Word Bank. Find and circle each word in the word search.</p>
      <div style="display:flex; gap: 14px; align-items: flex-start;">
        <div style="border: 1.5px solid #e76938; padding: 6px; border-radius: 4px;">
          ${grid.map(row => `<div style="display:flex;">${row.map(letter => `<div style="width:${cellSize}px; height:${cellSize}px; line-height:${cellSize}px; text-align:center; font-family: 'Courier New', monospace; font-size: 14px;">${letter}</div>`).join("")}</div>`).join("")}
        </div>
        ${bankHTML("Word Bank", content.wordSearch.words)}
      </div>
    `;
  }
  return `
    ${scholasticHeaderHTML("Choose describing words", content.themeLabel)}
    <div style="display:flex; gap: 16px; align-items: flex-start; margin-bottom: 14px;">
      <p style="flex:1; margin: 0;">Choose the best describing word to complete each sentence.</p>
      <div style="width: 200px;">${hint}</div>
    </div>
    <div style="display:flex; gap: 14px; align-items: flex-start;">
      <div style="flex:1;">${sentenceItems}</div>
      ${bankHTML("Word Bank", content.sentenceBank)}
    </div>
    ${wsHTML}
  `;
}

function previewReadingPassage(content, m) {
  const passage = (content.passage || "").split(/\n+/).map(p => `<p style="margin: 0 0 10px; line-height: 1.5;">${escapeHtml(p)}</p>`).join("");
  const passageTitle = content.passageTitle ? `<h3 style="margin: 0 0 8px; font-family: Georgia, serif;">${escapeHtml(content.passageTitle)}</h3>` : "";
  const qs = (content.questions || []).map((q, i) => `
    <div style="padding: 10px 0; border-bottom: 1px dashed #ddd;">
      <div style="font-size: 14px; margin-bottom: 6px;"><strong>${i + 1}.</strong> ${escapeHtml(q.q)}</div>
      <div style="border-bottom: 1.5px solid #222; height: 22px; margin-bottom: 4px;"></div>
      <div style="border-bottom: 1.5px solid #222; height: 22px;"></div>
    </div>
  `).join("");
  return `
    <div style="font-family: Georgia, 'Times New Roman', serif; padding: 8px 4px;">
      ${passageTitle}
      ${passage}
    </div>
    <hr style="border: none; border-top: 2px solid #222; margin: 14px 0;"/>
    <h4 style="margin: 0 0 8px;">Comprehension Questions</h4>
    ${qs}
  `;
}

/* -------- Previews for new templates -------- */

function previewCountTo10(content, m) {
  const rows = [content.example, ...content.problems].filter(Boolean);
  return rows.map((p, idx) => {
    const dotsSVG = renderCountDotsSVG(p.n, m.arrangement);
    return `<div style="display:flex; align-items:center; gap:14px; padding:10px 0; border-bottom: 1px dashed #eee;">
      <div style="color:#888; font-size:12px; min-width:18px;">${idx === 0 && content.example ? "Ex" : idx + (content.example ? 0 : 1) + "."}</div>
      <div style="flex:1;">${dotsSVG}</div>
      <div style="border-bottom: 2px solid #222; width: 80px; height: 26px;"></div>
    </div>`;
  }).join("");
}
function renderCountDotsSVG(n, arrangement) {
  const w = 280;
  const h = 50;
  let dots = "";
  if (arrangement === "ten_frame") {
    const cellW = 22;
    const cellH = 22;
    const startX = 8;
    const startY = (h - cellH * 2) / 2;
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 5; c++) {
        dots += `<rect x="${startX + c * cellW}" y="${startY + r * cellH}" width="${cellW}" height="${cellH}" fill="none" stroke="#777" stroke-width="0.7"/>`;
      }
    }
    let drawn = 0;
    for (let r = 0; r < 2 && drawn < n; r++) {
      for (let c = 0; c < 5 && drawn < n; c++) {
        dots += `<circle cx="${startX + c * cellW + cellW/2}" cy="${startY + r * cellH + cellH/2}" r="6" fill="#222"/>`;
        drawn++;
      }
    }
  } else {
    // row arrangement: just space them out
    const gap = Math.min(24, (w - 20) / (n + 1));
    for (let i = 0; i < n; i++) {
      dots += `<circle cx="${10 + (i + 1) * gap}" cy="${h/2}" r="6" fill="#222"/>`;
    }
  }
  return `<svg width="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMinYMid meet" style="max-height:50px;">${dots}</svg>`;
}

function previewWaysToMake(content, m) {
  const target = parseInt(m.target, 10);
  const renderItem = (p, isEx) => {
    const left = p.blankPos === "right" ? p.knownAddend : "<span style='display:inline-block;min-width:28px;border:1.5px solid #222;padding:0 4px;'>&nbsp;</span>";
    const right = p.blankPos === "left" ? p.knownAddend : "<span style='display:inline-block;min-width:28px;border:1.5px solid #222;padding:0 4px;'>&nbsp;</span>";
    return `<div style="display:inline-block; margin: 6px 14px; font-size:18px;">
      ${isEx ? '<span style="color:#888; font-size:12px; margin-right:6px;">Ex:</span>' : ''}${left} + ${right} = <strong>${target}</strong>
    </div>`;
  };
  let html = '<div style="display:grid; grid-template-columns: repeat(2, 1fr); gap: 4px;">';
  if (content.example) html += renderItem(content.example, true);
  content.problems.forEach(p => { html += renderItem(p, false); });
  html += '</div>';
  return html;
}

function previewAbPatterns(content, m) {
  const borderStyle = (isBlank) => `border:${isBlank ? '2px dashed #b53c3c' : '1px solid #ccc'}`;
  const renderShape = (token, isBlank) => {
    if (isBlank) {
      // Always render the blank box regardless of element type
      return `<div style="display:inline-block; width:36px; height:36px; ${borderStyle(true)}; margin: 0 2px; vertical-align:middle;"></div>`;
    }
    if (content.elementType === "shapes") {
      const shape = window.SHAPES[token];
      if (!shape) return `<div style="display:inline-block; width:36px; height:36px; ${borderStyle(false)}; margin: 0 2px; vertical-align:middle;"></div>`;
      const inner = shape.drawSVG({ cx: 18, cy: 18, size: 28, mode: "solid" });
      return `<div style="display:inline-block; width:36px; height:36px; ${borderStyle(false)}; margin: 0 2px; vertical-align:middle;">
        <svg width="36" height="36" viewBox="0 0 36 36">${inner}</svg>
      </div>`;
    }
    return `<div style="display:inline-block; width:36px; height:36px; ${borderStyle(false)}; line-height: 36px; text-align:center; font-size:18px; font-weight:bold; margin:0 2px;">${escapeHtml(token)}</div>`;
  };
  return content.problems.map(p => {
    const shown = p.shown.map(t => renderShape(t, false)).join("");
    const blanks = p.expected.map(() => renderShape("", true)).join("");
    return `<div style="padding: 6px 0; border-bottom: 1px solid #eee;">
      ${shown} <span style="color:#aaa; margin: 0 4px;">→</span> ${blanks}
    </div>`;
  }).join("");
}

function previewMultiplicationFacts(content, m) {
  const cols = parseInt(m.columns, 10);
  const renderH = (p, i) => `<div style="padding: 6px 0; font-size:16px;">
    <span style="color:#888; font-size:12px; margin-right:6px;">${i + 1}.</span>
    ${p.a} ${p.op} ${p.b} = <span style="display:inline-block; min-width: 44px; height: 24px; border: 1.5px solid #222; vertical-align:middle; margin-left: 6px;"></span>
  </div>`;
  const renderV = (p, i) => `<div style="text-align:center; padding: 6px 0; font-family: 'Courier New', monospace; font-size: 15px;">
    <div style="color:#888; font-size:11px; text-align:left; padding-left: 14px;">${i + 1}.</div>
    <div style="display:inline-block; text-align:right;">
      <div>${p.a}</div>
      <div>${p.op} ${p.b}</div>
      <div style="border-top: 1.5px solid #222; padding-top: 14px;"></div>
    </div>
  </div>`;
  const fn = m.format === "vertical" ? renderV : renderH;
  return `<div style="display:grid; grid-template-columns: repeat(${cols}, 1fr); gap: 4px 14px;">
    ${content.problems.map((p, i) => fn(p, i)).join("")}
  </div>`;
}

function previewFractionsVisual(content, m) {
  const rows = [content.example, ...content.problems].filter(Boolean);
  const renderItem = (p, i) => {
    const w = 140, h = 60;
    let pic = "";
    if (p.shape === "bar") {
      const barW = w - 16;
      const partW = barW / p.denominator;
      for (let j = 0; j < p.denominator; j++) {
        const filled = (p.mode === "identify" || i === 0) && j < p.numerator;
        pic += `<rect x="${8 + j * partW}" y="14" width="${partW}" height="30" fill="${filled ? '#5082b4' : 'none'}" stroke="#222" stroke-width="1"/>`;
      }
    } else {
      const cx = w/2, cy = h/2, r = Math.min(w/2, h/2) - 6;
      pic += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#222" stroke-width="1"/>`;
      for (let j = 0; j < p.denominator; j++) {
        const a = (j / p.denominator) * Math.PI * 2 - Math.PI / 2;
        const x2 = cx + r * Math.cos(a);
        const y2 = cy + r * Math.sin(a);
        pic += `<line x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}" stroke="#222" stroke-width="1"/>`;
      }
      if (p.mode === "identify" || i === 0) {
        for (let j = 0; j < p.numerator; j++) {
          const a1 = (j / p.denominator) * Math.PI * 2 - Math.PI / 2;
          const a2 = ((j + 1) / p.denominator) * Math.PI * 2 - Math.PI / 2;
          const large = (a2 - a1) > Math.PI ? 1 : 0;
          const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
          const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
          pic += `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z" fill="#5082b4" stroke="#222" stroke-width="1"/>`;
        }
      }
    }
    const ans = p.mode === "shade"
      ? `<div style="font-size:18px; font-weight:bold;">Shade ${p.numerator}/${p.denominator}</div>`
      : `<div style="font-size:18px;">= <span style="display:inline-block; width:30px; border: 1px solid #222; text-align:center; min-height:20px;">&nbsp;</span><br/><span style="display:inline-block; margin-left: 18px; width:30px; border: 1px solid #222; text-align:center; min-height:20px;">&nbsp;</span></div>`;
    return `<div style="display:flex; align-items:center; gap:14px; padding: 10px 0; border-bottom: 1px solid #eee;">
      <div style="color:#888; font-size:12px; min-width: 18px;">${i === 0 && content.example ? "Ex" : (i + (content.example ? 0 : 1)) + "."}</div>
      <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${pic}</svg>
      ${ans}
    </div>`;
  };
  return rows.map((p, i) => renderItem(p, i)).join("");
}

function previewTimeTelling(content, m) {
  const renderClock = (p, i) => {
    const size = 80, cx = size / 2, cy = size / 2, r = size / 2 - 4;
    let inner = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="#222" stroke-width="1.5"/>`;
    for (let hh = 1; hh <= 12; hh++) {
      const a = (hh / 12) * Math.PI * 2 - Math.PI / 2;
      const nx = cx + (r - 8) * Math.cos(a);
      const ny = cy + (r - 8) * Math.sin(a);
      inner += `<text x="${nx}" y="${ny + 3}" text-anchor="middle" font-size="8" font-weight="bold" fill="#222">${hh}</text>`;
    }
    const mAng = (p.minute / 60) * Math.PI * 2 - Math.PI / 2;
    const hFrac = (p.hour % 12) + p.minute / 60;
    const hAng = (hFrac / 12) * Math.PI * 2 - Math.PI / 2;
    inner += `<line x1="${cx}" y1="${cy}" x2="${cx + r * 0.55 * Math.cos(hAng)}" y2="${cy + r * 0.55 * Math.sin(hAng)}" stroke="#222" stroke-width="2.2"/>`;
    inner += `<line x1="${cx}" y1="${cy}" x2="${cx + r * 0.85 * Math.cos(mAng)}" y2="${cy + r * 0.85 * Math.sin(mAng)}" stroke="#222" stroke-width="1.4"/>`;
    inner += `<circle cx="${cx}" cy="${cy}" r="2" fill="#222"/>`;
    const ans = m.showDigital
      ? `<span style="display:inline-block; width:28px; height:24px; border:1px solid #222;">&nbsp;</span> : <span style="display:inline-block; width:28px; height:24px; border:1px solid #222;">&nbsp;</span>`
      : `<span style="display:inline-block; border-bottom: 2px solid #222; width: 90px; height: 22px;"></span>`;
    return `<div style="display:flex; align-items:center; gap:14px; padding: 10px 0; border-bottom: 1px solid #eee;">
      <div style="color:#888; font-size:12px; min-width: 18px;">${i + 1}.</div>
      <svg width="${size}" height="${size}">${inner}</svg>
      <div style="font-size:16px;">${ans}</div>
    </div>`;
  };
  return `<div style="display:grid; grid-template-columns: repeat(2, 1fr); gap: 0 22px;">
    ${content.problems.map((p, i) => renderClock(p, i)).join("")}
  </div>`;
}

function previewSightWords(content, m) {
  const isReadOnly = m.format === "read_only";
  return content.words.map(word => {
    const safe = escapeHtml(word);
    if (isReadOnly) {
      return `<div style="padding: 12px 0; text-align:center; font-size: 32px; font-weight:bold; border-bottom: 1px solid #ddd;">${safe}</div>`;
    }
    return `<div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; padding: 14px 0; border-bottom: 1px solid #eee; align-items: end;">
      <div style="font-size: 28px; font-weight: bold; padding-left: 8px; border-bottom: 1.5px solid #222;">${safe}</div>
      <div style="font-size: 28px; color: #c0c0c0; padding-left: 8px; border-bottom: 1.5px solid #222; border-left: 1px dashed #bbb;">${safe}</div>
      <div style="border-bottom: 1.5px solid #222; height: 38px; border-left: 1px dashed #bbb;"></div>
    </div>`;
  }).join("");
}

function previewTracingShapes(content, m) {
  const items = content.items || [];
  if (items.length === 0) {
    return `<p class="muted">No shapes selected. Click shape tiles above to add rows.</p>`;
  }
  const copies = parseInt(m.copiesPerRow, 10);
  const shapeSize = items.length <= 6 ? 60 : 50;
  const rowH = shapeSize + 24;
  const demoW = 80;
  const totalW = 800;
  const tracingW = totalW - demoW;
  const slotW = tracingW / copies;

  return items.map(shapeId => {
    const shape = window.SHAPES[shapeId];
    if (!shape) return "";
    const cyRow = rowH / 2;
    const topY = cyRow - shapeSize / 2 - 4;
    const botY = cyRow + shapeSize / 2 + 4;
    const guideLines = m.showGuideLines ? `
      <line x1="0" y1="${topY}" x2="${totalW}" y2="${topY}" stroke="#bbb" stroke-width="0.8"/>
      <line x1="0" y1="${botY}" x2="${totalW}" y2="${botY}" stroke="#bbb" stroke-width="0.8"/>
    ` : "";
    const demo = shape.drawSVG({ cx: demoW / 2, cy: cyRow, size: shapeSize, mode: "solid" });
    const dot = m.showStartDot ? `<circle cx="${demoW / 2 - shapeSize * 0.4}" cy="${cyRow - shapeSize * 0.4}" r="3" fill="#b53c3c"/>` : "";
    const divider = `<line x1="${demoW - 4}" y1="${topY - 2}" x2="${demoW - 4}" y2="${botY + 2}" stroke="#999" stroke-width="0.5" stroke-dasharray="2 2"/>`;
    const ghosts = Array.from({length: copies}).map((_, c) => {
      const cx = demoW + c * slotW + slotW / 2;
      return shape.drawSVG({ cx, cy: cyRow, size: shapeSize, mode: "dashed" });
    }).join("");
    return `
      <div style="margin-bottom: 2px;">
        <svg width="100%" viewBox="0 0 ${totalW} ${rowH}" preserveAspectRatio="xMinYMid meet" style="display:block;">
          ${guideLines}
          ${divider}
          ${demo}
          ${dot}
          ${ghosts}
        </svg>
      </div>
    `;
  }).join("");
}

function previewTracingWords(content, m) {
  const words = content.words || [];
  if (words.length === 0) {
    return `<p class="muted">No words yet. Type some words above, or pick a word list.</p>`;
  }
  const fontSize = words.length <= 6 ? 40 : 34;
  const padTop = 4;
  const baseline = padTop + fontSize * 0.82;
  const topLine = padTop + fontSize * 0.12;
  const midLine = padTop + fontSize * 0.55;
  const rowH = baseline + fontSize * 0.18;
  const totalW = 800;

  const guideLines = m.showGuideLines ? `
    <line x1="0" y1="${topLine}" x2="${totalW}" y2="${topLine}" stroke="#bbb" stroke-width="0.8"/>
    <line x1="0" y1="${midLine}" x2="${totalW}" y2="${midLine}" stroke="#bbb" stroke-width="0.8" stroke-dasharray="3 3"/>
    <line x1="0" y1="${baseline}" x2="${totalW}" y2="${baseline}" stroke="#bbb" stroke-width="0.8"/>
  ` : "";

  return words.map(word => {
    const safe = escapeHtml(word);
    const demoW = fontSize * 0.6 * word.length + 30;
    const ghostW = fontSize * 0.62 * word.length;
    const gap = fontSize * 0.7;
    const copies = [];
    let x = demoW + 14;
    while (x + ghostW <= totalW) { copies.push(x); x += ghostW + gap; }
    const ghosts = copies.map(cx => `<text x="${cx}" y="${baseline}" font-family="KGPrimaryDots, Helvetica, Arial, sans-serif" font-size="${fontSize * 1.05}" fill="#666">${safe}</text>`).join("");
    const dot = m.showStartDot ? `<circle cx="8" cy="${topLine + 3}" r="2.4" fill="#b53c3c"/>` : "";
    return `
      <div style="margin-bottom: 2px;">
        <svg width="100%" viewBox="0 0 ${totalW} ${rowH}" preserveAspectRatio="xMinYMid meet" style="display:block;">
          ${guideLines}
          ${dot}
          <line x1="${demoW - 10}" y1="${topLine - 4}" x2="${demoW - 10}" y2="${baseline + 4}" stroke="#999" stroke-width="0.6" stroke-dasharray="2 2"/>
          <text x="14" y="${baseline}" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="${fontSize}" fill="#1f2024">${safe}</text>
          ${ghosts}
        </svg>
      </div>
    `;
  }).join("");
}

function previewTracing(content, m, kidId) {
  const items = content.items || [];
  if (items.length === 0) {
    return `<p class="muted">No letters or numbers selected. Click letter tiles above to add rows.</p>`;
  }
  const copies = parseInt(m.lettersPerRow, 10);
  const fontSize = items.length <= 6 ? 50 : 42;
  const padTop = 4;
  const baseline = padTop + fontSize * 0.82;
  const topLine = padTop + fontSize * 0.12;
  const midLine = padTop + fontSize * 0.55;
  const rowH = baseline + fontSize * 0.18;
  const demoW = 70;
  const totalW = 800;
  const tracingW = totalW - demoW;
  const slotW = tracingW / copies;

  const guideLines = m.showGuideLines ? `
    <line x1="0" y1="${topLine}" x2="${totalW}" y2="${topLine}" stroke="#bbb" stroke-width="0.8"/>
    <line x1="0" y1="${midLine}" x2="${totalW}" y2="${midLine}" stroke="#bbb" stroke-width="0.8" stroke-dasharray="3 3"/>
    <line x1="0" y1="${baseline}" x2="${totalW}" y2="${baseline}" stroke="#bbb" stroke-width="0.8"/>
  ` : "";

  return items.map(ch => {
    const safe = escapeHtml(ch);
    const ghosts = Array.from({length: copies}).map((_, c) => {
      const cx = demoW + c * slotW + slotW / 2;
      return `<text x="${cx}" y="${baseline}" font-family="KGPrimaryDots, Helvetica, Arial, sans-serif" font-size="${fontSize * 1.05}" text-anchor="middle" fill="#555">${safe}</text>`;
    }).join("");
    return `
      <div style="margin-bottom: 2px;">
        <svg width="100%" viewBox="0 0 ${totalW} ${rowH}" preserveAspectRatio="xMinYMid meet" style="display:block;">
          ${guideLines}
          <line x1="${demoW - 8}" y1="${topLine - 4}" x2="${demoW - 8}" y2="${baseline + 4}" stroke="#999" stroke-width="0.6" stroke-dasharray="2 2"/>
          <text x="14" y="${baseline}" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="${fontSize}" fill="#1f2024">${safe}</text>
          ${ghosts}
        </svg>
      </div>
    `;
  }).join("");
}

function previewVerticalArithmetic(content, m) {
  const cols = parseInt(m.columns, 10);
  const renderProblem = (p) => {
    const digits = Math.max(...p.numbers.map(n => String(n).length));
    const padded = p.numbers.map((n, i) => {
      const numStr = String(n).padStart(digits, " ");
      const prefix = i === p.numbers.length - 1 ? (p.op === "+" ? "+ " : "- ") : "  ";
      return prefix + numStr;
    }).join("\n");
    return `<div style="display:inline-block; min-width: 80px;"><pre style="font-family: 'Courier New', monospace; font-size: 18px; line-height: 1.2; margin: 0; padding: 6px 0; text-align: left;">${escapeHtml(padded)}</pre><div style="border-top: 1.5px solid #222; margin-top: -2px; padding-top: 14px;"></div></div>`;
  };

  let html = "";
  if (content.example) {
    const ex = content.example;
    html += `<div style="border: 1.5px solid #222; border-radius: 4px; padding: 12px; margin-bottom: 16px;">
      <div style="font-weight:600; font-size: 12px; color: #444; margin-bottom: 6px;">Worked example</div>
      ${renderProblem(ex)}
      <div style="font-family: 'Courier New', monospace; font-size: 16px; padding-left: 30px; color: #333;">${ex.answer}</div>
    </div>`;
  }
  html += `<div style="display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: 18px 12px; padding: 8px 0;">`;
  content.problems.forEach((p, i) => {
    html += `<div style="text-align: center;"><span style="color:#888; font-size: 11px; display:block; margin-bottom: 2px;">${i + 1}.</span>${renderProblem(p)}</div>`;
  });
  html += `</div>`;
  return html;
}

function previewBalanceEquations(content, m) {
  const renderEq = (p) => {
    const boxStyle = "display:inline-block; min-width: 32px; height: 24px; border: 1.5px solid #222; vertical-align: middle; margin: 0 4px;";
    const num = (n) => `<span style="margin: 0 4px;">${n}</span>`;
    const bx = `<span style="${boxStyle}"></span>`;
    let parts;
    if (p.unknownSide === "left") {
      if (p.unknownPos === 0) parts = [bx, "+", num(p.left[1]), "=", num(p.right[0]), "+", num(p.right[1])];
      else parts = [num(p.left[0]), "+", bx, "=", num(p.right[0]), "+", num(p.right[1])];
    } else {
      if (p.unknownPos === 0) parts = [num(p.left[0]), "+", num(p.left[1]), "=", bx, "+", num(p.right[1])];
      else parts = [num(p.left[0]), "+", num(p.left[1]), "=", num(p.right[0]), "+", bx];
    }
    return `<div style="font-size: 17px; padding: 10px 0;">${parts.join(" ")}</div>`;
  };
  let html = "";
  if (content.example) {
    const ex = content.example;
    html += `<div style="border: 1.5px solid #222; border-radius: 4px; padding: 14px; margin-bottom: 16px; text-align:center;">
      <div style="font-size:17px;">[${ex.left[ex.unknownPos]}] + ${ex.left[1 - ex.unknownPos]} = ${ex.right[0]} + ${ex.right[1]}</div>
      <div style="font-size:13px; color:#666; margin-top: 8px;">${ex.total} = ${ex.total}</div>
    </div>`;
  }
  html += `<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px 24px;">`;
  content.problems.forEach(p => { html += renderEq(p); });
  html += `</div>`;
  return html;
}

function previewNumberOrder(content, m) {
  const renderRow = (p) => {
    const circles = p.numbers.map(n => `<span style="display:inline-block; width: 36px; height: 36px; border: 1.5px solid #222; border-radius: 50%; line-height: 36px; text-align: center; margin: 4px; font-size: 14px;">${n}</span>`).join("");
    const lines = p.sorted.map(() => `<span style="display:inline-block; border-bottom: 1.5px dashed #555; width: 50px; margin: 0 6px; height: 24px;"></span>`).join("");
    return `<div style="display: flex; align-items: center; gap: 20px; padding: 14px 0; border-bottom: 1px solid #eee;">
      <div style="flex: 1;">${circles}</div>
      <div style="flex: 1; text-align: center;">${lines}</div>
    </div>`;
  };
  let html = "";
  if (content.example) html += renderRow(content.example);
  content.problems.forEach(p => { html += renderRow(p); });
  return html;
}

function previewAddSubtract10(content, m) {
  const renderEq = (p) => `<div style="font-size:17px; padding:8px 0;">${p.a} ${p.op === "+" ? "+" : "−"} 10 = <span style="display:inline-block; min-width: 50px; height: 24px; border: 1.5px solid #222; vertical-align: middle; margin-left: 6px;"></span></div>`;
  let html = "";
  if (content.adds.length) {
    html += `<h4 style="margin: 0 0 8px;">Add 10.</h4><div style="display:grid; grid-template-columns: repeat(2, 1fr); gap: 4px 30px;">`;
    content.adds.forEach(p => html += renderEq(p));
    html += `</div>`;
  }
  if (content.subs.length) {
    html += `<h4 style="margin: 14px 0 8px;">Subtract 10.</h4><div style="display:grid; grid-template-columns: repeat(2, 1fr); gap: 4px 30px;">`;
    content.subs.forEach(p => html += renderEq(p));
    html += `</div>`;
  }
  return html;
}

function previewPlaceValue(content, m) {
  const digits = content.digits;
  const labels = digits === 2 ? ["tens?", "ones?"] : digits === 3 ? ["hundreds?", "tens?", "ones?"] : ["thousands?", "hundreds?", "tens?", "ones?"];
  const box = `<span style="display:inline-block; min-width: 30px; height: 22px; border: 1.5px solid #222; vertical-align: middle; margin: 0 4px;"></span>`;
  const renderRow = (n) => `
    <div style="display: flex; align-items: flex-start; gap: 16px; padding: 14px 0; border-bottom: 1px solid #eee;">
      <div style="background: #ddd; padding: 8px 16px; font-weight:600; font-size: 22px; min-width: 70px; text-align: center;">${n}</div>
      <div>
        ${labels.map(l => `<div style="margin: 2px 0;">${box} <span style="color:#444; font-size:12px;">${l}</span></div>`).join("")}
      </div>
      <div style="flex: 1; text-align: right;">
        ${labels.map((_, i) => `${box}${i < labels.length - 1 ? " + " : " = "}`).join("")}${box}
      </div>
    </div>
  `;
  let html = "";
  if (content.example) html += renderRow(content.example);
  content.numbers.forEach(n => html += renderRow(n));
  return html;
}


function openWorksheetModal(worksheetIdOrObject) {
  // Accepts either a worksheet ID (saved) or a worksheet object (unsaved preview)
  let ws;
  if (typeof worksheetIdOrObject === "string") {
    ws = findWorksheet(worksheetIdOrObject);
  } else {
    ws = worksheetIdOrObject;
  }
  if (!ws) return;
  currentWorksheetForModal = ws;
  document.getElementById("worksheetModalTitle").textContent = ws.title;

  if (ws.templateId) {
    // Template worksheet — render a real visual preview matching the PDF layout
    const template = window.TEMPLATES[ws.templateId];
    document.getElementById("worksheetPreview").innerHTML = `
      <div class="ws-header" style="background:#dcdcdc; padding: 0.8rem 1rem; border-radius: 8px;">
        <h3 style="margin:0;">${escapeHtml(ws.title)}</h3>
      </div>
      <p class="muted" style="margin-top: 0.5rem;">Template: ${escapeHtml(template.label)} • Generated locally • The PDF will render this exact layout, just on a printable page.</p>
      ${renderTemplatePreviewHTML(ws)}
    `;
  } else {
    // AI-generated worksheet — give it the same Scholastic-style header treatment
    document.getElementById("worksheetPreview").innerHTML = `
      <div class="ws-header" style="background:#dcdcdc; padding: 0.8rem 1rem; border-radius: 8px;">
        <h3 style="margin:0;">${escapeHtml(ws.title)}</h3>
      </div>
      <p style="font-size: 0.85rem; color: #666; margin-top: 0.6rem;">Name: ______________________________     Date: ______________</p>
      ${ws.instructions ? `<p style="margin-top: 0.6rem;"><em>${escapeHtml(ws.instructions)}</em></p>` : ""}
      <hr style="border:0; border-top:1px solid #ccc; margin: 1rem 0;"/>
      <div style="display: grid; gap: 0.6rem;">
        ${(ws.questions || []).map((q, i) => `
          <div style="padding: 0.6rem 0; border-bottom: 1px dashed #ddd;">
            <span style="font-weight: 600; color: #444; margin-right: 0.6rem;">${i + 1}.</span>
            <span>${escapeHtml(q.q).replace(/\n/g, "<br>")}</span>
          </div>
        `).join("")}
      </div>
    `;
  }
  document.getElementById("worksheetModal").hidden = false;
}

function downloadCurrentWorksheetPDF() {
  if (!currentWorksheetForModal) return;
  commitWorksheetIfNew(currentWorksheetForModal);
  buildPDF(currentWorksheetForModal, { includeAnswers: false });
}

function downloadCurrentAnswerKeyPDF() {
  if (!currentWorksheetForModal) return;
  commitWorksheetIfNew(currentWorksheetForModal);
  buildPDF(currentWorksheetForModal, { includeAnswers: true });
}

function commitWorksheetIfNew(ws) {
  // If this worksheet has the _unsaved flag, save it now to state
  if (ws._unsaved) {
    delete ws._unsaved;
    state.worksheets[ws.kidId].push(ws);
    saveState();
    toast("Saved to recent worksheets", "success");
    // Re-render so the new worksheet appears in the list behind the modal
    renderContent();
  }
}

function buildPDF(ws, { includeAnswers }) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "letter" });

  // If this is a template-based worksheet, dispatch to template renderer
  if (ws.templateId && window.TEMPLATES[ws.templateId]) {
    const template = window.TEMPLATES[ws.templateId];
    const kid = state.kids[ws.kidId];
    template.renderPDF(doc, ws.content, ws.modifiers, kid, { showAnswers: includeAnswers });
    const filename = (includeAnswers ? "answer_key_" : "worksheet_") + slugify(ws.title) + ".pdf";
    doc.save(filename);
    return;
  }

  // Legacy AI-generated worksheet: simple question list
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 50;
  let y = margin;

  doc.setFont("times", "bold");
  doc.setFontSize(18);
  doc.text((includeAnswers ? "ANSWER KEY — " : "") + ws.title, margin, y);
  y += 24;

  doc.setFont("times", "normal");
  doc.setFontSize(11);
  doc.text("Name: ______________________________     Date: ____________", margin, y);
  y += 20;

  doc.setFontSize(12);
  const instructions = doc.splitTextToSize(ws.instructions, pageW - margin * 2);
  doc.text(instructions, margin, y);
  y += instructions.length * 14 + 12;

  doc.setDrawColor(120);
  doc.line(margin, y, pageW - margin, y);
  y += 18;

  ws.questions.forEach((q, i) => {
    const isWriteLine = ["fill_in", "short_response", "trace"].includes(q.type);
    const qText = `${i + 1}. ${q.q}`;
    const lines = doc.splitTextToSize(qText, pageW - margin * 2);
    if (y + lines.length * 14 + 30 > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage();
      y = margin;
    }
    doc.setFont("times", "normal");
    doc.setFontSize(12);
    doc.text(lines, margin, y);
    y += lines.length * 14 + 6;

    if (includeAnswers) {
      doc.setFont("times", "italic");
      doc.setTextColor(80, 110, 80);
      doc.text("✓ " + (q.answer || ""), margin + 14, y);
      doc.setTextColor(0, 0, 0);
      y += 16;
    } else {
      // Leave space for the kid's answer
      if (q.type === "short_response") {
        for (let k = 0; k < 3; k++) {
          y += 18;
          doc.setDrawColor(180);
          doc.line(margin + 14, y, pageW - margin, y);
        }
        y += 8;
      } else {
        y += 22;
      }
    }
  });

  doc.setFont("times", "italic");
  doc.setFontSize(9);
  doc.setTextColor(140);
  doc.text("Generated by Homeschool HQ • BC Curriculum aligned", margin, doc.internal.pageSize.getHeight() - 24);

  const filename = (includeAnswers ? "answer_key_" : "worksheet_") + slugify(ws.title) + ".pdf";
  doc.save(filename);
}

/* ============================================================
   GRADE UPLOAD + MARKING
============================================================ */
let currentGradeFile = null;
let currentGradeWorksheetId = null;

function openGradeModal(worksheetId) {
  currentGradeWorksheetId = worksheetId || null;
  currentGradeFile = null;
  document.getElementById("gradePreview").hidden = true;
  document.getElementById("gradeResult").hidden = true;
  document.getElementById("runGradingBtn").disabled = true;
  document.getElementById("gradeFileInput").value = "";
  document.getElementById("gradeModal").hidden = false;
}

function onGradeFileChosen(e) {
  const file = e.target.files[0];
  if (!file) return;
  currentGradeFile = file;
  document.getElementById("runGradingBtn").disabled = false;
  const preview = document.getElementById("gradePreview");
  preview.hidden = false;
  if (file.type.startsWith("image/")) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      preview.innerHTML = `<img src="${ev.target.result}" style="max-width: 100%; max-height: 320px; border-radius: 6px; margin-top: 1rem;" />`;
    };
    reader.readAsDataURL(file);
  } else {
    preview.innerHTML = `<p class="muted" style="margin-top:1rem;">📎 ${escapeHtml(file.name)} — ready to upload.</p>`;
  }
}

async function runGrading() {
  if (!currentGradeFile) return;
  const btn = document.getElementById("runGradingBtn");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Marking…';

  try {
    const worksheet = currentGradeWorksheetId ? findWorksheet(currentGradeWorksheetId) : null;
    const grading = await callClaudeForGrading(currentGradeFile, worksheet);

    // Persist
    const kidId = state.currentKidId;
    state.gradings[kidId].push(grading);

    // Update difficulty + mastery based on recommendation
    applyGradingFeedback(kidId, worksheet, grading);
    saveState();

    // Show result
    const resultDiv = document.getElementById("gradeResult");
    resultDiv.hidden = false;
    resultDiv.innerHTML = `
      <hr/>
      <h3>Result</h3>
      <div class="row-between" style="margin-bottom: 0.8rem;">
        <div>
          <div class="kpi-value">${grading.score}%</div>
          <div class="kpi-label">Score</div>
        </div>
        <div>
          ${difficultyArrow(grading.recommendation)}
          <p class="muted" style="margin-top: 0.3rem;">Next worksheet: <strong>${grading.recommendation}</strong></p>
        </div>
      </div>
      <p><strong>Claude's notes:</strong> ${escapeHtml(grading.notes || "—")}</p>
      ${(worksheet && grading.score < 90) ? `
        <div style="margin-top: 0.8rem; padding-top: 0.8rem; border-top: 1px solid #eee;">
          <button class="btn btn-primary" id="reteachBtn">✨ Generate a re-teach worksheet</button>
          <p class="muted" style="margin-top: 0.4rem;">Builds a fresh practice page targeting exactly what ${state.kids[kidId].name} missed.</p>
        </div>` : ""}
    `;

    // Wire the re-teach button (only present when a worksheet is linked and score < 90)
    const reteachBtn = document.getElementById("reteachBtn");
    if (reteachBtn) {
      reteachBtn.addEventListener("click", async () => {
        reteachBtn.disabled = true;
        reteachBtn.innerHTML = '<span class="spinner"></span> Generating…';
        try {
          const kid = state.kids[kidId];
          const reteach = await generateReteachWorksheet(kid, worksheet, grading);
          reteach._unsaved = true;
          closeAllModals();
          openWorksheetModal(reteach);
          toast("Re-teach worksheet ready — preview below.", "success");
        } catch (err) {
          console.error(err);
          toast("Re-teach generation failed: " + err.message, "error");
          reteachBtn.disabled = false;
          reteachBtn.innerHTML = "✨ Generate a re-teach worksheet";
        }
      });
    }

    toast("Marked! Difficulty adjusted.", "success");
    renderContent(); // refresh dashboards/subject pages
  } catch (e) {
    console.error(e);
    toast("Grading failed: " + e.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = "Mark It";
  }
}

async function callClaudeForGrading(file, worksheet) {
  if (state.settings.apiKey && file.type.startsWith("image/")) {
    // Real API call with vision
    const base64 = await fileToBase64(file);
    const content = [
      { type: "image", source: { type: "base64", media_type: file.type, data: base64.split(",")[1] } },
      { type: "text", text: buildGradingPrompt(worksheet) }
    ];
    const response = await callClaudeAPI(null, { content, max_tokens: 2048 });
    const parsed = parseGradingJSON(response);
    return assembleGrading(parsed, worksheet);
  }
  // Mock grading
  return assembleGrading(mockGradingResponse(worksheet), worksheet);
}

function buildGradingPrompt(worksheet) {
  const ws = worksheet
    ? `The worksheet had ${worksheet.questions.length} questions:\n${worksheet.questions.map((q, i) => `${i + 1}. ${q.q}\n   Answer key: ${q.answer}`).join("\n")}\n`
    : "The worksheet structure is unknown — infer it from the photo.";

  return `You are marking a homeschool worksheet completed by a child.

${ws}

Look at the photo and assess the child's work. Return ONLY valid JSON:
{
  "score": <0-100 integer>,
  "perQuestion": [
    { "correct": <true|false>, "kidAnswer": "<what they wrote>", "feedback": "<short note>" }
  ],
  "confidence": "<high|medium|low>",
  "recommendation": "<harder|same|reteach|easier>",
  "notes": "<1-2 sentence summary for the parent>",
  "weakStandards": ["<BC standard id if applicable>"]
}

RECOMMENDATION RULES:
- score >= 90 AND confidence high → "harder"
- score 70-89 → "same"
- score 50-69 → "reteach" (same difficulty, same standard, different angle)
- score < 50 → "easier"

Be encouraging but honest. Note any handwriting concerns, erasures, or hesitation as confidence signals.`;
}

function parseGradingJSON(text) {
  const cleaned = text.replace(/^```json\n?|```$/g, "").trim();
  try { return JSON.parse(cleaned); } catch (e) {}
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch (e2) {}
  }
  throw new Error("Could not parse grading JSON");
}

function mockGradingResponse(worksheet) {
  // Random-ish but realistic mock
  const score = Math.floor(Math.random() * 40) + 55; // 55–95
  const rec = score >= 90 ? "harder" : score >= 70 ? "same" : score >= 50 ? "reteach" : "easier";
  return {
    score,
    perQuestion: worksheet ? worksheet.questions.map((q, i) => ({
      correct: Math.random() > 0.25,
      kidAnswer: "(mock) " + (q.answer || ""),
      feedback: ""
    })) : [],
    confidence: score >= 80 ? "high" : score >= 60 ? "medium" : "low",
    recommendation: rec,
    notes: "(mock grading — add a Claude API key for real photo-based marking) Score is randomized for testing.",
    weakStandards: []
  };
}

function assembleGrading(parsed, worksheet) {
  return {
    id: "gr_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
    worksheetId: worksheet ? worksheet.id : null,
    score: parsed.score,
    perQuestion: parsed.perQuestion || [],
    confidence: parsed.confidence,
    recommendation: parsed.recommendation,
    notes: parsed.notes,
    weakStandards: parsed.weakStandards || [],
    gradedAt: Date.now()
  };
}

function applyGradingFeedback(kidId, worksheet, grading) {
  const kid = state.kids[kidId];
  if (!worksheet) return;
  const subject = worksheet.subject;

  // Adjust difficulty
  const delta = grading.recommendation === "harder" ? 1
              : grading.recommendation === "easier" ? -1
              : 0;
  kid.difficulty[subject] = Math.max(1, Math.min(10, kid.difficulty[subject] + delta));

  // Update mastery for touched standards
  (worksheet.standards || []).forEach(stdId => {
    const current = kid.mastery[stdId] || "not_yet";
    let next = current;
    if (grading.score >= 90) next = upgradeState(current, 2);
    else if (grading.score >= 75) next = upgradeState(current, 1);
    else if (grading.score >= 50) next = current === "not_yet" ? "emerging" : current;
    else next = "emerging";
    kid.mastery[stdId] = next;
  });
}

function upgradeState(current, steps) {
  const order = ["not_yet", "emerging", "developing", "proficient", "extending"];
  const idx = Math.min(order.length - 1, order.indexOf(current) + steps);
  return order[idx];
}

/* ============================================================
   STANDARDS TAB
============================================================ */
function renderStandards(kid) {
  const subjects = [
    { key: "math", label: "Math", curriculum: window.CURRICULUM.math[kid.gradeKey] },
    { key: "ela",  label: "Reading & Writing", curriculum: window.CURRICULUM.ela[kid.gradeKey] }
  ];
  return `
    <div class="content-header">
      <div>
        <h2>BC Standards — ${kid.name}</h2>
        <div class="subtitle">${gradeLabel(kid)} • Tap a status pill to update mastery manually</div>
      </div>
    </div>

    ${subjects.map(s => `
      <div class="card" style="margin-bottom: 1.5rem;">
        <div class="card-title">${s.label}</div>
        <p class="muted" style="margin-bottom: 1rem;"><strong>Big Ideas:</strong> ${escapeHtml(s.curriculum.bigIdeas.join("  •  "))}</p>
        ${s.curriculum.content.map(std => {
          const mastery = kid.mastery[std.id] || "not_yet";
          return `
            <div class="standard-row">
              <div class="standard-text">
                <strong>${std.id}</strong> · <span class="tag">${std.topic}</span><br>
                ${escapeHtml(std.text)}
              </div>
              <button class="mastery-pill" data-state="${mastery}" data-standard="${std.id}">${labelForState(mastery)}</button>
            </div>
          `;
        }).join("")}
      </div>
    `).join("")}
  `;
}

function attachStandardsListeners(kid) {
  document.querySelectorAll(".mastery-pill").forEach(el => {
    el.addEventListener("click", () => cycleMastery(kid, el.dataset.standard));
  });
}

function cycleMastery(kid, stdId) {
  const order = ["not_yet", "emerging", "developing", "proficient", "extending"];
  const current = kid.mastery[stdId] || "not_yet";
  const next = order[(order.indexOf(current) + 1) % order.length];
  kid.mastery[stdId] = next;
  saveState();
  renderContent();
}

function labelForState(s) {
  return window.CURRICULUM.proficiencyScale.find(p => p.id === s)?.label || "Not yet";
}

/* ============================================================
   DAILY PLAN TAB
============================================================ */
/* ============================================================
   PROGRESS SNAPSHOT — single source of truth that the Daily Plan
   (and anything else) reads to reflect the AI's latest marking.
============================================================ */
const SUBJECT_TOPICS = {
  reading: ["Story", "Reading", "Vocabulary", "Phonics", "Print"],
  writing: ["Writing", "Handwriting", "Grammar", "Conventions", "Letters"]
};

function getSubjectStandards(kid, subject) {
  const curriculum = getCurriculumForKid(kid, subject);
  if (!curriculum) return [];
  const items = curriculum.content || [];
  if (subject === "math") return items;
  const topics = SUBJECT_TOPICS[subject];
  return topics ? items.filter(i => topics.includes(i.topic)) : items;
}

// Gradings carry no subject of their own — resolve it via the worksheet.
function gradingsForSubject(kid, subject) {
  return (state.gradings[kid.id] || [])
    .map(g => {
      const ws = g.worksheetId ? findWorksheet(g.worksheetId) : null;
      return Object.assign({}, g, {
        _subject: ws ? ws.subject : null,
        _wsTitle: ws ? ws.title : null,
        _wsStandards: ws ? (ws.standards || []) : []
      });
    })
    .filter(g => g._subject === subject)
    .sort((a, b) => b.gradedAt - a.gradedAt);
}

function buildProgressSnapshot(kid) {
  const subjects = {};
  ["math", "reading", "writing"].forEach(subject => {
    const standards = getSubjectStandards(kid, subject);
    const mastery = { not_yet: 0, emerging: 0, developing: 0, proficient: 0, extending: 0, total: standards.length };
    standards.forEach(s => {
      const lvl = kid.mastery[s.id] || "not_yet";
      if (mastery[lvl] != null) mastery[lvl]++;
    });

    const gradings = gradingsForSubject(kid, subject);
    const lastGrading = gradings[0] || null;

    const wsList = (state.worksheets[kid.id] || []).filter(w => w.subject === subject);
    const lastActivity = wsList.length
      ? Math.max.apply(null, wsList.map(w => w.generatedAt))
      : (lastGrading ? lastGrading.gradedAt : null);

    // Prioritise weak standards: recently-flagged first, then in-progress, then untouched.
    const weakIds = new Set();
    gradings.slice(0, 3).forEach(g => (g.weakStandards || []).forEach(id => weakIds.add(id)));
    const order = [];
    standards.forEach(s => { if (weakIds.has(s.id)) order.push(s); });
    standards.forEach(s => {
      const m = kid.mastery[s.id] || "not_yet";
      if (!order.includes(s) && (m === "emerging" || m === "developing")) order.push(s);
    });
    standards.forEach(s => {
      const m = kid.mastery[s.id] || "not_yet";
      if (!order.includes(s) && m === "not_yet") order.push(s);
    });
    const weakStandards = order.slice(0, 4);

    // Derive a focus from the most recent AI mark.
    let focus, focusKind;
    if (lastGrading && (lastGrading.recommendation === "reteach" || lastGrading.recommendation === "easier")) {
      focusKind = lastGrading.recommendation;
      const what = lastGrading._wsTitle || (weakStandards[0] && weakStandards[0].text) || "the last topic";
      focus = `Re-teach "${what}" — last scored ${lastGrading.score}%.`;
    } else if (lastGrading && lastGrading.recommendation === "harder") {
      focusKind = "harder";
      focus = `Ready to advance — aced the last one (${lastGrading.score}%). Push difficulty up.`;
    } else if (weakStandards.length) {
      focusKind = "practice";
      focus = `Work on: ${weakStandards[0].text}.`;
    } else {
      focusKind = "maintain";
      focus = `Strong across the board — keep practicing and extend.`;
    }

    subjects[subject] = {
      difficulty: kid.difficulty[subject],
      mastery,
      lastGrading,
      lastActivity,
      weakStandards,
      recentWorksheetCount: wsList.length,
      focus,
      focusKind
    };
  });
  return subjects;
}

function masteryBarHTML(mastery) {
  const segs = [
    { key: "extending",  color: "#3a8f3a" },
    { key: "proficient", color: "#6bbf6b" },
    { key: "developing", color: "#7fb3e0" },
    { key: "emerging",   color: "#f4c44d" },
    { key: "not_yet",    color: "#e2e2e2" }
  ];
  const total = mastery.total || 1;
  const bars = segs.map(s => {
    const pct = (mastery[s.key] / total) * 100;
    return pct > 0 ? `<div style="width:${pct}%; background:${s.color};" title="${s.key}: ${mastery[s.key]}"></div>` : "";
  }).join("");
  const mastered = mastery.proficient + mastery.extending;
  return `
    <div style="display:flex; height:10px; border-radius:5px; overflow:hidden; background:#eee; margin:6px 0;">${bars}</div>
    <div class="muted" style="font-size:0.75rem;">${mastered} of ${mastery.total} standards proficient+</div>
  `;
}

function renderDailyPlan(kid) {
  const snap = buildProgressSnapshot(kid);
  const subjMeta = { math: "🔢 Math", reading: "📖 Reading", writing: "✏️ Writing" };

  const cards = ["math", "reading", "writing"].map(subject => {
    const s = snap[subject];
    const lg = s.lastGrading;
    const lastLine = lg
      ? `<span class="score-badge ${lg.score >= 85 ? "score-high" : lg.score >= 65 ? "score-mid" : "score-low"}">${lg.score}%</span> ${difficultyArrow(lg.recommendation)} <span class="muted" style="font-size:0.75rem;">${formatDate(lg.gradedAt)}</span>`
      : `<span class="muted" style="font-size:0.8rem;">No marked work yet</span>`;
    return `
      <div class="card" style="display:flex; flex-direction:column; gap:0.4rem;">
        <div class="row-between">
          <strong>${subjMeta[subject]}</strong>
          <span class="tag tag-accent">Level ${s.difficulty}/10</span>
        </div>
        ${masteryBarHTML(s.mastery)}
        <div class="row-between" style="align-items:center;">${lastLine}</div>
        <div style="background:#f6f6f4; border-radius:6px; padding:0.5rem 0.7rem; font-size:0.85rem;">
          <strong>Today's focus:</strong> ${escapeHtml(s.focus)}
        </div>
        <button class="btn btn-ghost" data-goto-subject="${subject}" style="align-self:flex-start; font-size:0.8rem; padding:0.3rem 0.6rem;">Make a ${subject} worksheet →</button>
      </div>
    `;
  }).join("");

  return `
    <div class="content-header">
      <div>
        <h2>Daily Plan — ${kid.name}</h2>
        <div class="subtitle">${formatDate(Date.now())} • Built from ${kid.name}'s latest marked progress</div>
      </div>
      <button class="btn btn-primary" id="generatePlanBtn">✨ Generate today's plan</button>
    </div>

    <div class="card-title" style="margin-bottom:0.6rem;">📊 Current standing</div>
    <div class="grid grid-3" style="margin-bottom:1.4rem;">${cards}</div>

    <div id="planOutput">
      <div class="empty">
        <div class="empty-icon">📅</div>
        The cards above update automatically as you mark ${kid.name}'s work.
        Tap "Generate today's plan" to turn this into a 30–60 min lesson plan.
      </div>
    </div>
  `;
}

function attachPlanListeners(kid) {
  document.getElementById("generatePlanBtn").addEventListener("click", () => generateDailyPlan(kid));
  document.querySelectorAll("[data-goto-subject]").forEach(btn => {
    btn.addEventListener("click", () => setCurrentTab(btn.dataset.gotoSubject));
  });
}

async function generateDailyPlan(kid) {
  const btn = document.getElementById("generatePlanBtn");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Planning…';
  try {
    const snap = buildProgressSnapshot(kid);
    const prompt = buildDailyPlanPrompt(kid, snap);

    let response;
    if (state.settings.apiKey) {
      response = await callClaudeAPI(prompt, { max_tokens: 1600 });
    } else {
      response = mockDailyPlan(kid, snap);
    }

    document.getElementById("planOutput").innerHTML = `
      <div class="card">
        <div class="card-title">📅 Today's plan</div>
        <pre style="white-space: pre-wrap; font-family: inherit; margin: 0;">${escapeHtml(response)}</pre>
      </div>
    `;
  } catch (e) {
    toast("Plan generation failed: " + e.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = "✨ Generate today's plan";
  }
}

function buildDailyPlanPrompt(kid, snap) {
  const subjLabel = { math: "Math", reading: "Reading", writing: "Writing" };
  const lines = ["math", "reading", "writing"].map(subject => {
    const s = snap[subject];
    const lg = s.lastGrading;
    const lastMark = lg
      ? `last marked ${formatDate(lg.gradedAt)} — scored ${lg.score}%, AI said "${lg.recommendation}"${lg.notes ? ` (${lg.notes})` : ""}`
      : "no graded work yet";
    const weak = s.weakStandards.length ? s.weakStandards.map(w => w.text).join("; ") : "none flagged";
    const mastered = s.mastery.proficient + s.mastery.extending;
    return `${subjLabel[subject]}: difficulty ${s.difficulty}/10; ${mastered}/${s.mastery.total} standards proficient+; ${lastMark}; weak spots: ${weak}; suggested focus: ${s.focus}`;
  }).join("\n");

  return `Build a 30–60 minute homeschool lesson plan for ${kid.name}, age ${kid.age}, ${gradeLabel(kid)}.
Interests: ${kid.interests || "general"}

CURRENT PROGRESS (from the most recent AI marking — let this drive the plan):
${lines}

PLANNING RULES:
- Where the AI recommended "reteach" or "easier", spend the main block re-teaching that exact skill at or below the current difficulty, from a fresh angle.
- Where the AI recommended "harder", advance that subject and stretch them.
- Otherwise, target the listed weak spots at the current difficulty.
- Match each activity to ${kid.name}'s difficulty level for that subject.

Return a friendly plain-text plan with:
- A warm-up (5 min)
- 2–3 short focused activities (10–15 min each), each naming the subject + the specific skill and difficulty
- A creative/play-based wrap-up
- A short "Materials" line (paper, pencil, blocks, coins, etc.)
Where a worksheet would help, say which app tab/template to use (e.g. "Math → Multiplication facts" or "Reading → Reading passage").`;
}

function mockDailyPlan(kid, snap) {
  const m = snap.math, r = snap.reading, w = snap.writing;
  return `Today's plan for ${kid.name} (mock — add a Claude API key for fully personalized plans)

🌅 Warm-up (5 min)
- Quick mental math at Level ${m.difficulty}/10.

📘 Math (15 min) — ${m.focus}
- ${m.lastGrading && (m.lastGrading.recommendation === "reteach" || m.lastGrading.recommendation === "easier")
      ? "Use the re-teach flow or generate a fresh worksheet on that skill."
      : "Generate a worksheet from the Math tab targeting the focus above."}

📖 Reading (15 min) — ${r.focus}
- Read aloud 10 min, then ${kid.name} retells it. Try Reading → Reading passage for comprehension Qs.

✏️ Writing (10 min) — ${w.focus}
- A short writing task at Level ${w.difficulty}/10.

🎨 Wrap-up (10 min)
- Free creative time: drawing, building, or outside.

Materials: pencil, paper, picture book, optional blocks or counters.`;
}

/* ============================================================
   READING LOG TAB
============================================================ */
function renderReadingLog(kid) {
  const log = state.readingLog[kid.id] || [];
  return `
    <div class="content-header">
      <div>
        <h2>Reading Log — ${kid.name}</h2>
        <div class="subtitle">${log.length} books recorded</div>
      </div>
      <button class="btn btn-primary" id="addBookBtn">+ Add a book</button>
    </div>

    <div id="newBookForm" hidden class="card" style="margin-bottom: 1.5rem;">
      <div class="card-title">New book entry</div>
      <div class="grid grid-2">
        <div class="form-group">
          <label>Title</label>
          <input type="text" id="bookTitle" placeholder="e.g. The Very Hungry Caterpillar" />
        </div>
        <div class="form-group">
          <label>Author</label>
          <input type="text" id="bookAuthor" placeholder="Author name" />
        </div>
      </div>
      <div class="grid grid-2">
        <div class="form-group">
          <label>Date read</label>
          <input type="text" id="bookDate" value="${new Date().toISOString().slice(0, 10)}" />
        </div>
        <div class="form-group">
          <label>${kid.name}'s rating (1–5)</label>
          <input type="number" id="bookRating" min="1" max="5" value="4" />
        </div>
      </div>
      <div class="form-group">
        <label>Reflection / notes</label>
        <textarea id="bookNotes" placeholder="What did ${kid.name} think? Any new words?"></textarea>
      </div>
      <div class="btn-row">
        <button class="btn btn-secondary" id="cancelBookBtn">Cancel</button>
        <button class="btn btn-primary" id="saveBookBtn">Save</button>
      </div>
    </div>

    ${log.length === 0
      ? `<div class="empty"><div class="empty-icon">📚</div>No books logged yet.</div>`
      : `<div class="history-list">${log.sort((a, b) => (b.date || "").localeCompare(a.date || "")).map(b => `
          <div class="history-item">
            <div class="meta">
              <div class="meta-title">${escapeHtml(b.title)} ${b.author ? `<span class="muted">— ${escapeHtml(b.author)}</span>` : ""}</div>
              <div class="meta-sub">${b.date || ""} • ${"⭐".repeat(b.rating || 0)}${b.notes ? " • " + escapeHtml(b.notes).slice(0, 80) : ""}</div>
            </div>
            <button class="btn btn-ghost" data-action="del-book" data-book-id="${b.id}">✕</button>
          </div>
        `).join("")}</div>`}
  `;
}

function attachReadingLogListeners(kid) {
  document.getElementById("addBookBtn").addEventListener("click", () => {
    document.getElementById("newBookForm").hidden = false;
  });
  const cancelBtn = document.getElementById("cancelBookBtn");
  if (cancelBtn) cancelBtn.addEventListener("click", () => document.getElementById("newBookForm").hidden = true);
  const saveBtn = document.getElementById("saveBookBtn");
  if (saveBtn) saveBtn.addEventListener("click", () => {
    const book = {
      id: "bk_" + Date.now(),
      title: document.getElementById("bookTitle").value.trim(),
      author: document.getElementById("bookAuthor").value.trim(),
      date: document.getElementById("bookDate").value.trim(),
      rating: parseInt(document.getElementById("bookRating").value, 10) || 0,
      notes: document.getElementById("bookNotes").value.trim()
    };
    if (!book.title) { toast("Title is required", "error"); return; }
    state.readingLog[kid.id].push(book);
    saveState();
    renderContent();
  });
  document.querySelectorAll("[data-action='del-book']").forEach(el => {
    el.addEventListener("click", () => {
      state.readingLog[kid.id] = state.readingLog[kid.id].filter(b => b.id !== el.dataset.bookId);
      saveState();
      renderContent();
    });
  });
}

/* ============================================================
   PORTFOLIO TAB
============================================================ */
function renderPortfolio(kid) {
  const counts = countMastery(kid);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const totalStandards = (window.CURRICULUM.math[kid.gradeKey]?.content.length || 0) + (window.CURRICULUM.ela[kid.gradeKey]?.content.length || 0);
  return `
    <div class="content-header">
      <div>
        <h2>Portfolio — ${kid.name}</h2>
        <div class="subtitle">Year-end snapshot for records or reporting</div>
      </div>
      <button class="btn btn-primary" id="exportPortfolioBtn">📥 Export PDF</button>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <div class="card-title">Standards coverage</div>
        <p><strong>${total}</strong> / ${totalStandards} BC standards touched</p>
        <ul class="stack" style="list-style:none; padding:0;">
          ${window.CURRICULUM.proficiencyScale.map(p => `
            <li class="row-between"><span>${p.label}</span><span class="tag">${counts[p.id] || 0}</span></li>
          `).join("")}
        </ul>
      </div>
      <div class="card">
        <div class="card-title">Activity totals</div>
        <p><strong>${state.worksheets[kid.id]?.length || 0}</strong> worksheets generated</p>
        <p><strong>${state.gradings[kid.id]?.length || 0}</strong> worksheets marked</p>
        <p><strong>${state.readingLog[kid.id]?.length || 0}</strong> books in reading log</p>
        <p><strong>${computeAvgScore(state.gradings[kid.id] || []) ?? "—"}%</strong> average score</p>
      </div>
    </div>
  `;
}

function attachPortfolioListeners(kid) {
  document.getElementById("exportPortfolioBtn").addEventListener("click", () => exportPortfolioPDF(kid));
}

function exportPortfolioPDF(kid) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 50;
  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(`${kid.name} — Year Portfolio`, margin, y); y += 24;
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(`${gradeLabel(kid)} • Generated ${formatDate(Date.now())}`, margin, y); y += 24;

  const counts = countMastery(kid);
  doc.setFont("helvetica", "bold"); doc.text("BC Standards Mastery", margin, y); y += 18;
  doc.setFont("helvetica", "normal");
  window.CURRICULUM.proficiencyScale.forEach(p => {
    doc.text(`${p.label}: ${counts[p.id] || 0}`, margin + 14, y); y += 16;
  });
  y += 16;

  doc.setFont("helvetica", "bold"); doc.text("Activity Summary", margin, y); y += 18;
  doc.setFont("helvetica", "normal");
  doc.text(`Worksheets generated: ${state.worksheets[kid.id]?.length || 0}`, margin + 14, y); y += 16;
  doc.text(`Worksheets marked:    ${state.gradings[kid.id]?.length || 0}`, margin + 14, y); y += 16;
  doc.text(`Books in reading log: ${state.readingLog[kid.id]?.length || 0}`, margin + 14, y); y += 16;
  doc.text(`Average score: ${computeAvgScore(state.gradings[kid.id] || []) ?? "—"}%`, margin + 14, y); y += 24;

  // Standards detail by subject
  ["math", "ela"].forEach(subject => {
    const c = window.CURRICULUM[subject][kid.gradeKey];
    if (!c) return;
    doc.addPage(); y = margin;
    doc.setFont("helvetica", "bold"); doc.setFontSize(14);
    doc.text(`${c.subject} — ${c.grade}`, margin, y); y += 22;
    doc.setFontSize(11); doc.setFont("helvetica", "normal");
    c.content.forEach(std => {
      const mastery = kid.mastery[std.id] || "not_yet";
      const label = labelForState(mastery);
      const lines = doc.splitTextToSize(`${std.id} [${label}] · ${std.text}`, 500);
      if (y + lines.length * 13 > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage(); y = margin;
      }
      doc.text(lines, margin, y); y += lines.length * 13 + 4;
    });
  });

  doc.save(`portfolio_${kid.name.toLowerCase()}.pdf`);
}

/* ============================================================
   SETTINGS MODAL
============================================================ */
function openSettings() {
  document.getElementById("apiKeyInput").value = state.settings.apiKey;
  document.getElementById("modelSelect").value = state.settings.model;
  renderKidProfilesEdit();
  document.getElementById("settingsModal").hidden = false;
}

function renderKidProfilesEdit() {
  const wrap = document.getElementById("kidProfilesEdit");
  wrap.innerHTML = Object.values(state.kids).map(kid => `
    <div style="border: 1px solid var(--border); border-radius: 6px; padding: 0.8rem; margin-bottom: 0.8rem;">
      <h4 style="margin-bottom: 0.5rem;">${kid.name}</h4>
      <div class="grid grid-2">
        <div class="form-group">
          <label>Age</label>
          <input type="number" data-kid-field="age" data-kid-id="${kid.id}" value="${kid.age}" />
        </div>
        <div class="form-group">
          <label>Grade level (K, 1, 3)</label>
          <select data-kid-field="gradeKey" data-kid-id="${kid.id}">
            <option value="K" ${kid.gradeKey === "K" ? "selected" : ""}>BC Kindergarten</option>
            <option value="1" ${kid.gradeKey === "1" ? "selected" : ""}>BC Grade 1</option>
            <option value="3" ${kid.gradeKey === "3" ? "selected" : ""}>BC Grade 3</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Interests (used to personalize worksheets)</label>
        <input type="text" data-kid-field="interests" data-kid-id="${kid.id}" value="${escapeAttr(kid.interests)}" placeholder="e.g. horses, dinosaurs, Lego" />
      </div>
      <div class="form-group">
        <label>Notes</label>
        <textarea data-kid-field="notes" data-kid-id="${kid.id}" placeholder="Any special learning needs, preferences, or context">${escapeHtml(kid.notes)}</textarea>
      </div>
    </div>
  `).join("");
}

function saveSettings() {
  state.settings.apiKey = document.getElementById("apiKeyInput").value.trim();
  state.settings.model = document.getElementById("modelSelect").value;

  // Save kid profiles
  document.querySelectorAll("[data-kid-id]").forEach(el => {
    const id = el.dataset.kidId;
    const field = el.dataset.kidField;
    let val = el.value;
    if (field === "age") val = parseInt(val, 10) || state.kids[id].age;
    state.kids[id][field] = val;
  });

  saveState();
  renderHeader();
  renderContent();
  closeAllModals();
  toast("Settings saved", "success");
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "homeschool_data_" + new Date().toISOString().slice(0, 10) + ".json";
  a.click();
  URL.revokeObjectURL(url);
  toast("Data exported", "success");
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const imported = JSON.parse(ev.target.result);
      if (!imported.kids) throw new Error("Invalid file");
      state = { ...structuredClone(DEFAULT_STATE), ...imported };
      saveState();
      renderHeader();
      renderContent();
      closeAllModals();
      toast("Data imported", "success");
    } catch (err) {
      toast("Import failed: " + err.message, "error");
    }
  };
  reader.readAsText(file);
}

/* ============================================================
   UTILITIES
============================================================ */
function closeAllModals() {
  document.querySelectorAll(".modal").forEach(m => m.hidden = true);
}

function toast(msg, type) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast visible" + (type ? " toast-" + type : "");
  t.hidden = false;
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => {
    t.className = "toast";
    t.hidden = true;
  }, 3200);
}

function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function escapeHtml(s) {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) { return escapeHtml(s).replace(/"/g, "&quot;"); }
function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : ""; }
function slugify(s) { return (s || "worksheet").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }

function findWorksheet(id) {
  for (const kidId of Object.keys(state.worksheets)) {
    const w = state.worksheets[kidId].find(w => w.id === id);
    if (w) return w;
  }
  return null;
}
function findGrading(worksheetId) {
  for (const kidId of Object.keys(state.gradings)) {
    const g = state.gradings[kidId].find(g => g.worksheetId === worksheetId);
    if (g) return g;
  }
  return null;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
