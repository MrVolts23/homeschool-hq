/* ============================================================
   Reading Game — "Word Worlds"
   Kid-facing phonics flashcard game for Makena & Oakley.

   Engine rules (from the science-of-reading research pass):
   - Every card is a DECODING event. Pictures confirm AFTER the
     attempt, never before (no picture-cueing).
   - Sound cards play the PHONEME, never the letter name (name is
     said once, on the intro card only).
   - Incremental rehearsal: ~1 new item per 6 known; a missed card
     returns after 2 cards, then 4, then next session.
   - Leitner boxes 0-5 across days; mastered = box>=4, which also
     requires FAST answers (latency measured silently — no timers
     shown to the child).
   - No failure states: a wrong tap glows the right answer, replays
     the sound, and quietly reschedules. No red X, no buzzer.
   - Rewards are surprise-based (critter eggs on skill mastery),
     never "do N cards get a prize" contingencies.

   Depends on globals from reading-game-data.js (RG_PHONEMES,
   RG_LESSONS, RG_HEART_WORDS, RG_PICTURES, RG_STANDARDS_MAP) and
   runtime globals from app.js (state, saveState, toast, kidColor,
   MASTERY_ORDER) — app.js loads after this file; all references
   here run at event time, never at parse time.
============================================================ */
(function () {
  "use strict";

  const SESSION_CARDS = 12;        // target cards per session
  const MAX_NEW_PER_SESSION = 2;   // new graphemes introduced per session
  const FAST_MS = { g: 3000, w: 5000, h: 5000 };  // "fluent" latency ceilings
  const BOX_DAYS = [0, 0, 1, 2, 5, 14];           // review spacing per box

  /* ---------------- state plumbing ---------------- */

  function ensureRG(kidId) {
    if (!state.readingGame) state.readingGame = {};
    if (!state.readingGame[kidId]) {
      state.readingGame[kidId] = {
        placed: false, lessonIdx: 0, items: {}, critters: [],
        sessions: [], introduced: {}
      };
    }
    return state.readingGame[kidId];
  }

  function item(rg, key) {
    if (!rg.items[key]) {
      rg.items[key] = { box: 0, streak: 0, seen: 0, right: 0, lapses: 0, last: null, ms: null };
    }
    return rg.items[key];
  }

  function todayISO() { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function daysSince(iso) {
    if (!iso) return 999;
    return Math.floor((new Date(todayISO()) - new Date(iso)) / 86400000);
  }
  function isDue(it) { return daysSince(it.last) >= (BOX_DAYS[it.box] || 0); }
  function isFast(it, type) { return it.ms != null && it.ms <= FAST_MS[type]; }

  /* ---------------- lesson / item pools ---------------- */

  function lessonAt(i) { return window.RG_LESSONS[i] || null; }

  // Every item unlocked at the kid's current position.
  function unlockedItems(rg) {
    const out = [];
    for (let i = 0; i <= rg.lessonIdx && i < RG_LESSONS.length; i++) {
      const L = RG_LESSONS[i];
      if (L.g && L.kind !== "review") out.push({ key: "g:" + L.g, type: "g", g: L.g, lesson: L });
      (L.words || []).forEach(w => out.push({ key: "w:" + w.toLowerCase(), type: "w", w: w, lesson: L }));
    }
    const reachedIds = new Set(RG_LESSONS.slice(0, rg.lessonIdx + 1).map(l => l.id));
    RG_HEART_WORDS.forEach(hw => {
      if (reachedIds.has(hw.after)) out.push({ key: "h:" + hw.w.toLowerCase(), type: "h", w: hw.w, hw: hw });
    });
    // de-dup (review lessons repeat words)
    const seen = new Set();
    return out.filter(x => (seen.has(x.key) ? false : (seen.add(x.key), true)));
  }

  function taughtGraphemes(rg) {
    const gs = [];
    for (let i = 0; i <= rg.lessonIdx && i < RG_LESSONS.length; i++) {
      const L = RG_LESSONS[i];
      if (L.g && L.kind === "letter") gs.push(L.g);
    }
    return gs;
  }

  /* ---------------- session builder ---------------- */

  const CONFUSABLE = { b: ["d", "p"], d: ["b", "p"], p: ["b", "d"], m: ["n", "w"], n: ["m", "u"], u: ["n", "v"], i: ["j", "l"], j: ["i", "g"], f: ["t", "l"], v: ["u", "w"], c: ["o", "e"], a: ["o", "e"], e: ["a", "o"], o: ["a", "c"], g: ["q", "j"], h: ["n", "b"], k: ["x", "h"], l: ["i", "t"], r: ["n", "m"], s: ["z", "c"], t: ["f", "l"], w: ["m", "v"], x: ["k", "z"], y: ["v", "j"], z: ["s", "x"] };

  function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; }
  function sample(arr, n) { return shuffle(arr).slice(0, n); }

  function letterChoices(rg, target) {
    const pool = taughtGraphemes(rg).filter(g => g !== target);
    const pref = (CONFUSABLE[target] || []).filter(g => pool.includes(g));
    const picks = pref.slice(0, 2);
    while (picks.length < 2 && pool.length) {
      const p = pool[Math.floor(Math.random() * pool.length)];
      if (!picks.includes(p)) picks.push(p);
      if (pool.length <= picks.length) break;
    }
    return shuffle([target].concat(picks));
  }

  // Words that differ by roughly one grapheme — so only real decoding
  // discriminates (never guessable from first letter alone).
  function wordChoices(rg, target) {
    const all = unlockedItems(rg).filter(x => x.type !== "g").map(x => x.w.toLowerCase());
    const t = target.toLowerCase();
    const scored = all.filter(w => w !== t).map(w => {
      let score = 0;
      if (w.length === t.length) score += 2;
      if (w[0] === t[0]) score += 2;                       // same onset → must read past letter 1
      if (w.slice(-2) === t.slice(-2)) score += 1;         // same rime-ish
      let diff = 0; for (let i = 0; i < Math.max(w.length, t.length); i++) if (w[i] !== t[i]) diff++;
      if (diff === 1) score += 3;
      return { w, score };
    }).sort((a, b) => b.score - a.score);
    const picks = scored.slice(0, 4).map(s => s.w);
    return shuffle([t].concat(sample(picks, Math.min(2, picks.length))));
  }

  // Build the card list for one session.
  function buildSession(kidId) {
    const rg = ensureRG(kidId);
    const pool = unlockedItems(rg);
    const byKey = {}; pool.forEach(x => byKey[x.key] = x);

    const due = pool.filter(x => { const it = rg.items[x.key]; return it && it.seen > 0 && isDue(it); })
      .sort((a, b) => (rg.items[a.key].box - rg.items[b.key].box) || (rg.items[a.key].lapses < rg.items[b.key].lapses ? 1 : -1));
    const fresh = pool.filter(x => { const it = rg.items[x.key]; return !it || it.seen === 0; });
    const known = pool.filter(x => { const it = rg.items[x.key]; return it && it.seen > 0 && it.box >= 3; });

    const cards = [];
    let newCount = 0;

    // 1. teach card if the current lesson's grapheme is un-introduced
    const L = lessonAt(rg.lessonIdx);
    if (L && L.g && !rg.introduced[L.g] && due.length < 8) {
      cards.push({ kind: "teach", g: L.g, lesson: L });
      cards.push({ kind: "sound", g: L.g, key: "g:" + L.g });
      cards.push({ kind: "sound", g: L.g, key: "g:" + L.g });
      newCount++;
    }

    // 2. due reviews (the heart of the session)
    due.slice(0, 8).forEach(x => cards.push(cardFor(rg, x)));

    // 3. fresh items from the current lesson (words become blend cards first)
    for (const x of fresh) {
      if (cards.length >= SESSION_CARDS || newCount >= MAX_NEW_PER_SESSION + 2) break;
      // un-introduced graphemes wait for their teach card; introduced-but-
      // never-scored ones (e.g. kid exited mid-intro) drill as sound cards
      if (x.type === "g" && !rg.introduced[x.g]) continue;
      cards.push(cardFor(rg, x));
      newCount++;
    }

    // 4. pad with confident review so the session ends strong (80-90% success mix)
    for (const x of shuffle(known)) {
      if (cards.length >= SESSION_CARDS) break;
      if (cards.some(c => c.key === x.key)) continue;
      cards.push(cardFor(rg, x));
    }

    // Interleave lightly so same-item reps aren't adjacent
    return { rg, cards: interleave(cards) };
  }

  function cardFor(rg, x) {
    if (x.type === "g") return { kind: "sound", g: x.g, key: x.key };
    const it = rg.items[x.key];
    const firstTimes = !it || it.seen < 2;
    if (x.type === "h") return { kind: "heart", w: x.w, hw: x.hw, key: x.key, intro: firstTimes };
    if (firstTimes) return { kind: "blend", w: x.w, key: x.key };
    return { kind: "word", w: x.w, key: x.key };
  }

  function interleave(cards) {
    const out = cards.slice();
    for (let i = 1; i < out.length; i++) {
      if (out[i].key && out[i].key === out[i - 1].key) {
        const j = Math.min(i + 2, out.length - 1);
        [out[i], out[j]] = [out[j], out[i]];
      }
    }
    return out;
  }

  /* ---------------- audio ---------------- */

  const RGAudio = {
    _cache: {}, _current: null, _ctx: null,

    stop() {
      if (this._current) { try { this._current.pause(); } catch (e) { } this._current = null; }
      try { window.speechSynthesis && speechSynthesis.cancel(); } catch (e) { }
    },

    // Render (or fetch cached) a clip via the Electron say/afconvert
    // pipeline; falls back to speechSynthesis in the plain browser.
    async play(req) {
      this.stop();
      const key = JSON.stringify(req);
      try {
        if (window.hsBackup && window.hsBackup.tts) {
          let url = this._cache[key];
          if (!url) {
            const res = await window.hsBackup.tts(req);
            if (res && res.ok) { url = res.url; this._cache[key] = url; }
          }
          if (url) {
            await new Promise((resolve) => {
              const a = new Audio(url);
              this._current = a;
              a.onended = resolve; a.onerror = resolve;
              a.play().catch(resolve);
            });
            return;
          }
        }
      } catch (e) { console.warn("[rg-audio]", e); }
      // Browser / fallback path
      await this._speak(req);
    },

    _speak(req) {
      return new Promise((resolve) => {
        if (!window.speechSynthesis) return resolve();
        let text = req.text || "", rate = 0.85, pitch = 1.05;
        if (req.kind === "phon") { text = req.fb || req.text || ""; rate = 0.7; }
        if (req.kind === "blend") { rate = 0.5; }
        const u = new SpeechSynthesisUtterance(text);
        u.rate = rate; u.pitch = pitch;
        const vs = speechSynthesis.getVoices();
        const v = vs.find(v => /premium/i.test(v.name) && v.lang.startsWith("en")) ||
                  vs.find(v => /enhanced/i.test(v.name) && v.lang.startsWith("en")) ||
                  vs.find(v => /samantha/i.test(v.name)) || vs.find(v => v.lang === "en-US");
        if (v) u.voice = v;
        u.onend = resolve; u.onerror = resolve;
        speechSynthesis.speak(u);
      });
    },

    phoneme(g) {
      const p = RG_PHONEMES[g] || {};
      // stops carry a tight per-sound cap (burst + a hint of vowel, schwa cut
      // off); hums/vowels may ring ~1s
      const maxSec = p.cap || (p.type === "stop" ? 0.3 : 1.1);
      return this.play({ kind: "phon", phon: p.phon, fb: p.fb, text: p.fb, maxSec });
    },
    word(w, slow) {
      return this.play({ kind: "word", text: w, rate: slow ? 110 : 150 });
    },
    blend(w) {
      // continuous blend: word said very slowly = "connected phonation"
      return this.play({ kind: "blend", text: w });
    },
    say(text) { return this.play({ kind: "word", text: text }); },

    // little WebAudio chimes — no assets needed
    _beep(freq, t0, dur) {
      try {
        if (!this._ctx) this._ctx = new (window.AudioContext || window.webkitAudioContext)();
        const c = this._ctx, o = c.createOscillator(), g = c.createGain();
        o.type = "sine"; o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, c.currentTime + t0);
        g.gain.exponentialRampToValueAtTime(0.25, c.currentTime + t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + t0 + dur);
        o.connect(g); g.connect(c.destination);
        o.start(c.currentTime + t0); o.stop(c.currentTime + t0 + dur + 0.05);
      } catch (e) { }
    },
    chime() { this._beep(660, 0, 0.15); this._beep(880, 0.12, 0.2); },
    fanfare() { [523, 659, 784, 1047].forEach((f, i) => this._beep(f, i * 0.12, 0.25)); }
  };

  /* ---------------- session runtime ---------------- */

  let S = null; // active session

  function startSession(kidId) {
    const built = buildSession(kidId);
    if (!built.cards.length) { toast("Nothing to practice yet — run placement first", "error"); return; }
    S = {
      kidId, rg: built.rg, cards: built.cards, idx: 0,
      results: [], requeued: {}, shownAt: 0, answered: false,
      masteredThisSession: []
    };
    openOverlay();
    renderCard();
  }

  /* ---------------- overlay & cards ---------------- */

  function overlayEl() {
    let el = document.getElementById("rgOverlay");
    if (!el) {
      el = document.createElement("div");
      el.id = "rgOverlay";
      document.body.appendChild(el);
    }
    return el;
  }
  function openOverlay() { overlayEl().classList.add("rg-open"); document.body.classList.add("rg-lock"); }
  function closeOverlay() {
    RGAudio.stop();
    overlayEl().classList.remove("rg-open");
    document.body.classList.remove("rg-lock");
    S = null;
    if (typeof renderContent === "function" && state.currentTab === "reading-game") renderContent();
  }

  function kidName() { return state.kids[S.kidId] ? state.kids[S.kidId].name : ""; }

  function progressDots() {
    return '<div class="rg-dots">' + S.cards.map((c, i) =>
      `<span class="rg-dot ${i < S.idx ? "done" : i === S.idx ? "now" : ""}"></span>`).join("") + "</div>";
  }

  function headerHTML() {
    return `<div class="rg-top">
      <button class="rg-exit" id="rgExit" title="Exit">✕</button>
      ${progressDots()}
      <span class="rg-kid" style="color:${kidColor(S.kidId)}">${kidName()}</span>
    </div>`;
  }

  function renderCard() {
    const el = overlayEl();
    if (!S || S.idx >= S.cards.length) return renderWin();
    const card = S.cards[S.idx];
    S.answered = false;
    S.firstTapDone = false;

    let body = "";
    if (card.kind === "teach") body = teachHTML(card);
    else if (card.kind === "sound") body = soundHTML(card);
    else if (card.kind === "blend") body = blendHTML(card);
    else if (card.kind === "word") body = wordHTML(card);
    else if (card.kind === "heart") body = heartHTML(card);

    el.innerHTML = headerHTML() + `<div class="rg-stage">${body}</div>`;
    attachCardListeners(card);
    S.shownAt = Date.now();
    autoplayCard(card);
  }

  /* ---- card templates ---- */

  function displayG(g) { return g.replace("_e", "-e").replace("2", ""); }

  function teachHTML(card) {
    const L = card.lesson;
    return `<div class="rg-teach">
      <div class="rg-bigletter rg-tap-hear" data-hear-g="${card.g}">${displayG(card.g)}</div>
      <p class="rg-teach-line">${L.label || `This letter says…`}</p>
      <button class="rg-btn rg-btn-hear" data-hear-g="${card.g}">🔊 Hear it again</button>
      <button class="rg-btn rg-btn-go" id="rgGotIt">Got it! →</button>
    </div>`;
  }

  function soundHTML(card) {
    const rg = S.rg;
    const choices = letterChoices(rg, card.g);
    return `<div class="rg-sound">
      <button class="rg-earbtn" data-hear-g="${card.g}" title="Hear the sound">🔊</button>
      <p class="rg-prompt">Tap the letter that makes this sound</p>
      <div class="rg-choices">
        ${choices.map(g => `<button class="rg-choice rg-choice-letter" data-pick="${g}" data-answer="${card.g}">${displayG(g)}</button>`).join("")}
      </div>
    </div>`;
  }

  function blendHTML(card) {
    const letters = splitWord(card.w);
    return `<div class="rg-blend">
      <div class="rg-word rg-tap-hear" data-hear-blend="${card.w}">
        ${letters.map((g, i) => `<span class="rg-wl" data-i="${i}">${g}</span>`).join("")}
      </div>
      <p class="rg-prompt">Watch it slide together… then <b>say it out loud!</b></p>
      <button class="rg-btn rg-btn-hear" data-hear-blend="${card.w}">🔊 Blend it again</button>
      <button class="rg-btn rg-btn-go" id="rgSaidIt">I said it! →</button>
    </div>`;
  }

  function wordHTML(card) {
    const pic = RG_PICTURES[card.w.toLowerCase()];
    if (pic) {
      return `<div class="rg-wordcard" data-mode="pic">
        <div class="rg-word rg-tap-hear" data-hear-word="${card.w}">${card.w}</div>
        <p class="rg-prompt">Read it out loud… then tap its picture</p>
        <div class="rg-choices rg-choices-pic" id="rgPicChoices" data-answer="${card.w}"></div>
      </div>`;
    }
    const choices = wordChoices(S.rg, card.w);
    return `<div class="rg-wordcard" data-mode="audio">
      <button class="rg-earbtn" data-hear-word="${card.w}" title="Hear the word">🔊</button>
      <p class="rg-prompt">Tap the word you hear</p>
      <div class="rg-choices">
        ${choices.map(w => `<button class="rg-choice rg-choice-word" data-pick="${w}" data-answer="${card.w.toLowerCase()}">${w}</button>`).join("")}
      </div>
    </div>`;
  }

  function heartHTML(card) {
    const segs = card.hw.segs.map(([txt, heart]) =>
      `<span class="rg-seg ${heart ? "rg-heart" : ""}">${txt}${heart ? '<span class="rg-heart-mark">♥</span>' : ""}</span>`).join("");
    const choices = wordChoices(S.rg, card.w);
    return `<div class="rg-heartcard">
      <div class="rg-word rg-word-heart rg-tap-hear" data-hear-word="${card.w}">${segs}</div>
      <p class="rg-prompt">${card.intro ? "The ♥ part is tricky — learn it by heart! " : ""}Tap the word you hear</p>
      <div class="rg-choices">
        ${choices.map(w => `<button class="rg-choice rg-choice-word" data-pick="${w}" data-answer="${card.w.toLowerCase()}">${w}</button>`).join("")}
      </div>
    </div>`;
  }

  // split a word into taught graphemes (greedy longest-match)
  function splitWord(w) {
    const multi = ["igh", "tch", "dge", "ck", "sh", "th", "ch", "wh", "ng", "nk", "qu", "ai", "ay", "ee", "ea", "oa", "ow", "oo", "ou", "oi", "oy", "ar", "or", "er", "ir", "ur", "ll", "ss", "ff", "zz"];
    const out = []; let i = 0; const lw = w.toLowerCase();
    while (i < lw.length) {
      const three = lw.slice(i, i + 3), two = lw.slice(i, i + 2);
      if (multi.includes(three)) { out.push(w.slice(i, i + 3)); i += 3; }
      else if (multi.includes(two)) { out.push(w.slice(i, i + 2)); i += 2; }
      else { out.push(w.slice(i, i + 1)); i += 1; }
    }
    return out;
  }

  /* ---- card behaviors ---- */

  async function autoplayCard(card) {
    try {
      if (card.kind === "teach") {
        const p = RG_PHONEMES[card.g] || {};
        rg_markIntroduced(card.g);
        await RGAudio.say(`This letter is ${p.name}.`);
        await RGAudio.say(`It says…`);
        await RGAudio.phoneme(card.g);
      } else if (card.kind === "sound") {
        await RGAudio.phoneme(card.g);
      } else if (card.kind === "blend") {
        await animateBlend(card.w);
      } else if (card.kind === "word") {
        const mode = document.querySelector(".rg-wordcard");
        if (mode && mode.dataset.mode === "audio") await RGAudio.word(card.w);
        // pic mode: word is ON SCREEN — kid decodes silently first; then pictures appear
        if (mode && mode.dataset.mode === "pic") {
          setTimeout(() => revealPicChoices(card), 2500);
        }
      } else if (card.kind === "heart") {
        if (card.intro) {
          await RGAudio.word(card.w);
          await RGAudio.say("The heart part is tricky!");
        } else {
          await RGAudio.word(card.w);
        }
      }
    } catch (e) { console.warn("[rg]", e); }
  }

  function revealPicChoices(card) {
    const box = document.getElementById("rgPicChoices");
    if (!box || !S || S.cards[S.idx] !== card) return;
    const target = card.w.toLowerCase();
    const pool = Object.keys(RG_PICTURES).filter(w => w !== target &&
      unlockedItems(S.rg).some(x => x.w && x.w.toLowerCase() === w));
    const picks = shuffle([target].concat(sample(pool, 2)));
    box.innerHTML = picks.map(w =>
      `<button class="rg-choice rg-choice-pic" data-pick="${w}" data-answer="${target}">${RG_PICTURES[w]}</button>`).join("");
    box.querySelectorAll(".rg-choice").forEach(b => b.addEventListener("click", onChoiceTap));
  }

  async function animateBlend(w) {
    const letters = document.querySelectorAll(".rg-wl");
    const parts = splitWord(w);
    // highlight each grapheme with its sound, then the whole word blended slow, then normal
    for (let i = 0; i < parts.length; i++) {
      letters.forEach(l => l.classList.remove("lit"));
      const el = document.querySelector(`.rg-wl[data-i="${i}"]`);
      if (el) el.classList.add("lit");
      const key = parts[i].toLowerCase();
      await RGAudio.phoneme(RG_PHONEMES[key] ? key : key[0]);
    }
    letters.forEach(l => l.classList.add("lit"));
    await RGAudio.blend(w);
    await RGAudio.word(w);
  }

  function attachCardListeners(card) {
    const el = overlayEl();
    const exit = el.querySelector("#rgExit");
    if (exit) exit.addEventListener("click", closeOverlay);

    el.querySelectorAll("[data-hear-g]").forEach(b => b.addEventListener("click", (e) => {
      e.stopPropagation(); RGAudio.phoneme(b.dataset.hearG);
    }));
    el.querySelectorAll("[data-hear-word]").forEach(b => b.addEventListener("click", (e) => {
      e.stopPropagation(); RGAudio.word(b.dataset.hearWord);
    }));
    el.querySelectorAll("[data-hear-blend]").forEach(b => b.addEventListener("click", (e) => {
      e.stopPropagation(); animateBlend(b.dataset.hearBlend);
    }));

    const got = el.querySelector("#rgGotIt");
    if (got) got.addEventListener("click", () => { advance(true, 1500); });
    const said = el.querySelector("#rgSaidIt");
    if (said) said.addEventListener("click", () => { advance(true, Date.now() - S.shownAt); });

    el.querySelectorAll(".rg-choice").forEach(b => b.addEventListener("click", onChoiceTap));
  }

  function onChoiceTap(e) {
    if (!S || S.answered) return;
    const btn = e.currentTarget;
    const pick = (btn.dataset.pick || "").toLowerCase();
    const answer = (btn.dataset.answer || "").toLowerCase();
    const correct = pick === answer;
    const ms = Date.now() - S.shownAt;

    if (correct) {
      S.answered = true;
      btn.classList.add("rg-right");
      RGAudio.chime();
      // score only if this was the FIRST tap on the card
      advance(!S.firstTapDone, ms, 550);
    } else {
      // no red X, no buzzer: fade the wrong pick, glow the right one, replay sound
      S.firstTapDone = true;
      btn.classList.add("rg-dim");
      const rightBtn = Array.from(document.querySelectorAll(".rg-choice"))
        .find(b => (b.dataset.pick || "").toLowerCase() === answer);
      if (rightBtn) rightBtn.classList.add("rg-glow");
      const card = S.cards[S.idx];
      if (card.kind === "sound") RGAudio.phoneme(card.g);
      else if (card.w) RGAudio.word(card.w);
      // requeue: return after 2 cards, then after 4 (max twice)
      const key = card.key;
      if (key) {
        const times = S.requeued[key] || 0;
        if (times < 2) {
          const at = Math.min(S.idx + (times === 0 ? 2 : 4) + 1, S.cards.length);
          S.cards.splice(at, 0, Object.assign({}, card, { requeue: true }));
          S.requeued[key] = times + 1;
          const dots = document.querySelector(".rg-dots");
          if (dots) dots.outerHTML = progressDots();
        }
      }
    }
  }

  function advance(scoredCorrect, ms, delay) {
    const card = S.cards[S.idx];
    recordResult(card, scoredCorrect, ms);
    setTimeout(() => { if (!S) return; S.idx++; renderCard(); }, delay || 350);
  }

  function rg_markIntroduced(g) {
    if (S && !S.rg.introduced[g]) { S.rg.introduced[g] = true; saveState(); }
  }

  /* ---------------- scoring & progression ---------------- */

  function recordResult(card, correct, ms) {
    if (!card.key) return; // teach cards aren't scored
    const rg = S.rg;
    const it = item(rg, card.key);
    const type = card.key[0]; // g | w | h

    it.seen++;
    const wasDue = isDue(it);   // capture BEFORE stamping today's date
    it.last = todayISO();
    it.ms = it.ms == null ? ms : Math.round(it.ms * 0.6 + ms * 0.4);

    const before = it.box;
    if (correct) {
      it.right++; it.streak++;
      if (!S.boxedThisSession) S.boxedThisSession = {};
      // Learning phase (box < 3): every correct rep climbs, so a brand-new
      // letter can reach "known" within its intro session and unlock the next.
      // Mastery phase (box >= 3): ONE promotion per session — reaching
      // box 4/5 must happen across days (spaced retrieval), and requires speed.
      if (it.box < 3) {
        it.box = Math.min(it.box + 1, 3);
      } else if (!S.boxedThisSession[card.key] && wasDue) {  // box 4/5 only via spaced review
        let next = Math.min(it.box + 1, 5);
        if (next >= 4 && !isFast(it, type)) next = 3; // mastery requires fluency
        it.box = next;
        S.boxedThisSession[card.key] = true;
      }
    } else {
      it.streak = 0; it.lapses++;
      it.box = Math.max(0, it.box - 1);
    }
    S.results.push({ key: card.key, correct, ms });
    if (before < 4 && it.box >= 4) S.masteredThisSession.push(card.key);
    saveState();
  }

  // called at session end
  function updateProgression(rg) {
    // unlock next lesson when current lesson's core items hit box>=3
    let guard = 0;
    while (guard++ < 10) {
      const L = lessonAt(rg.lessonIdx);
      if (!L) break;
      const gOK = !L.g || L.kind === "review" || ((rg.items["g:" + L.g] || {}).box >= 3) || rg.introduced[L.g] === true && L.kind !== "letter";
      const words = (L.words || []);
      const wOK = !words.length || words.filter(w => (rg.items["w:" + w.toLowerCase()] || {}).box >= 3).length >= Math.ceil(words.length * 0.6);
      const gReallyOK = !L.g ? true : ((rg.items["g:" + L.g] || {}).box >= 3);
      if ((L.kind === "review" ? wOK : gReallyOK && wOK) && rg.lessonIdx < RG_LESSONS.length - 1) rg.lessonIdx++;
      else break;
    }
    // hatch critters for fully-mastered lessons (box>=4)
    RG_LESSONS.forEach(L => {
      if (rg.critters.includes(L.id)) return;
      const idx = RG_LESSONS.indexOf(L);
      if (idx > rg.lessonIdx) return;
      const gM = !L.g || ((rg.items["g:" + L.g] || {}).box >= 4);
      const words = (L.words || []);
      const wM = !words.length || words.filter(w => (rg.items["w:" + w.toLowerCase()] || {}).box >= 4).length >= Math.ceil(words.length * 0.6);
      if (gM && wM && (L.g || words.length)) rg.critters.push(L.id);
    });
  }

  // upgrade-only mastery bump into the BC standards system
  function updateStandards(kidId) {
    const kid = state.kids[kidId];
    if (!kid) return;
    const rg = ensureRG(kidId);
    const rules = RG_STANDARDS_MAP[kid.gradeKey];
    if (!rules) return;
    const letterIdx = RG_LESSONS.findIndex(l => l.id === "L-rev1");
    const counts = { sounds: 0, words: 0, advanced: 0 };
    Object.keys(rg.items).forEach(k => {
      const it = rg.items[k];
      if (it.box < 4) return;
      if (k.startsWith("g:")) counts.sounds++;
      else {
        counts.words++;
        const w = k.slice(2);
        const inAdvanced = RG_LESSONS.some((L, i) => i > letterIdx && (L.words || []).some(x => x.toLowerCase() === w));
        if (inAdvanced || k.startsWith("h:")) counts.advanced++;
      }
    });
    if (!kid.mastery) kid.mastery = {};
    rules.forEach(r => {
      let target = null;
      if (counts[r.metric] >= r.proficient) target = "proficient";
      else if (counts[r.metric] >= r.developing) target = "developing";
      else if (counts[r.metric] > 0) target = "emerging";
      if (!target) return;
      const cur = kid.mastery[r.std] || "not_yet";
      if (MASTERY_ORDER.indexOf(target) > MASTERY_ORDER.indexOf(cur)) kid.mastery[r.std] = target;
    });
  }

  /* ---------------- win screen & eggs ---------------- */

  function renderWin() {
    const rg = S.rg;
    const kidId = S.kidId;
    const correct = S.results.filter(r => r.correct).length;
    const total = S.results.length || 1;

    const beforeCritters = rg.critters.length;
    updateProgression(rg);
    updateStandards(kidId);
    const newCritters = rg.critters.slice(beforeCritters).map(id => {
      const L = RG_LESSONS.find(l => l.id === id);
      return L ? L.critter : null;
    }).filter(Boolean);

    rg.sessions.push({ date: todayISO(), cards: total, correct, mastered: S.masteredThisSession.length });
    if (rg.sessions.length > 200) rg.sessions = rg.sessions.slice(-200);
    saveState();

    const el = overlayEl();
    const pct = Math.round(correct / total * 100);
    el.innerHTML = `
      <div class="rg-win">
        <div class="rg-confetti">${"🎉🎊⭐✨🌟".repeat(6).split("").map((c, i) =>
          `<span style="--d:${(i % 10) / 10}s;--x:${(i * 37) % 100}%">${c}</span>`).join("")}</div>
        <h1 class="rg-win-title">Great reading, ${kidName()}!</h1>
        <div class="rg-win-stats">${S.results.length ? `⭐ ${correct} of ${total}` : "⭐ Warm-up done!"}</div>
        ${newCritters.length ? `<div id="rgEggZone" class="rg-eggzone"><div class="rg-egg" id="rgEgg">🥚</div><p class="rg-egg-hint">Something's wiggling… tap it!</p></div>` : ""}
        <div class="rg-win-btns">
          <button class="rg-btn rg-btn-go" id="rgDone">All done ✔</button>
          <button class="rg-btn" id="rgMore">Play more</button>
        </div>
      </div>`;
    RGAudio.fanfare();
    RGAudio.say(`Great reading, ${kidName()}!`);

    const eggQueue = newCritters.slice();
    const egg = el.querySelector("#rgEgg");
    if (egg) egg.addEventListener("click", function hatch() {
      const critter = eggQueue.shift();
      if (!critter) return;
      const zone = el.querySelector("#rgEggZone");
      zone.innerHTML = `<div class="rg-critter-pop">${critter.e}</div><p class="rg-critter-name">${critter.n} joined your shelf!</p>` +
        (eggQueue.length ? `<div class="rg-egg" id="rgEgg2">🥚</div>` : "");
      RGAudio.fanfare();
      RGAudio.say(`${critter.n} hatched!`);
      const egg2 = zone.querySelector("#rgEgg2");
      if (egg2) egg2.addEventListener("click", hatch);
    });

    el.querySelector("#rgDone").addEventListener("click", closeOverlay);
    el.querySelector("#rgMore").addEventListener("click", () => startSession(kidId));
  }

  /* ---------------- placement quiz ---------------- */

  const PLACEMENT_STAGES = [
    { name: "sounds", pass: 8, probes: ["m", "s", "t", "p", "i", "n", "d", "g", "e", "r"], kind: "sound", lands: "L-a" },
    { name: "cvc", pass: 4, probes: ["sit", "map", "dog", "bus", "ten"], kind: "word", lands: "L-rev1" },
    { name: "digraphs", pass: 4, probes: ["ship", "chip", "that", "duck", "ring"], kind: "word", lands: "L-bl1" },
    { name: "vce", pass: 3, probes: ["cake", "bike", "home", "cute"], kind: "word", lands: "L-suffix" }
  ];

  function startPlacement(kidId) {
    S = {
      kidId, rg: ensureRG(kidId), placement: true, stage: 0, probeIdx: 0,
      stageCorrect: 0, lastLanded: "L-a", results: [], requeued: {},
      masteredThisSession: []
    };
    openOverlay();
    const el = overlayEl();
    el.innerHTML = `<div class="rg-win">
      <h1 class="rg-win-title">Quick check for ${kidName()}</h1>
      <p class="rg-prompt" style="max-width:420px">A few taps to find the right starting spot. Let them answer on their own — it's okay to not know! It just finds where the fun starts.</p>
      <div class="rg-win-btns">
        <button class="rg-btn rg-btn-go" id="rgPlaceGo">Start</button>
        <button class="rg-btn" id="rgPlaceSkip">Start at the very beginning</button>
      </div></div>`;
    el.querySelector("#rgPlaceGo").addEventListener("click", () => renderProbe());
    el.querySelector("#rgPlaceSkip").addEventListener("click", () => finishPlacement("L-a"));
  }

  function renderProbe() {
    const st = PLACEMENT_STAGES[S.stage];
    if (!st) return finishPlacement(S.lastLanded);
    if (S.probeIdx >= st.probes.length) {
      if (S.stageCorrect >= st.pass) {
        S.lastLanded = st.lands === "L-a" ? PLACEMENT_STAGES[S.stage + 1] ? PLACEMENT_STAGES[S.stage].lands : st.lands : st.lands;
        S.lastLanded = st.lands; S.stage++; S.probeIdx = 0; S.stageCorrect = 0;
        return renderProbe();
      }
      return finishPlacement(S.stage === 0 ? "L-a" : PLACEMENT_STAGES[S.stage - 1].lands);
    }
    const probe = st.probes[S.probeIdx];
    const el = overlayEl();
    S.shownAt = Date.now(); S.answered = false; S.firstTapDone = false;

    if (st.kind === "sound") {
      const allLetters = "amstpfinodcugbekhrlwjyxvz".split("");
      const wrong = sample(allLetters.filter(l => l !== probe), 2);
      const choices = shuffle([probe].concat(wrong));
      el.innerHTML = headerPlacement() + `<div class="rg-stage"><div class="rg-sound">
        <button class="rg-earbtn" data-hear-g="${probe}">🔊</button>
        <p class="rg-prompt">Tap the letter that makes this sound</p>
        <div class="rg-choices">${choices.map(g =>
          `<button class="rg-choice rg-choice-letter" data-pick="${g}" data-answer="${probe}">${g}</button>`).join("")}</div>
      </div></div>`;
      RGAudio.phoneme(probe);
    } else {
      const others = { sit: ["sat", "set"], map: ["mop", "mat"], dog: ["dig", "dot"], bus: ["bug", "bun"], ten: ["tin", "tan"], ship: ["shop", "chip"], chip: ["chin", "ship"], that: ["then", "this"], duck: ["dock", "deck"], ring: ["rang", "rink"], cake: ["coke", "lake"], bike: ["bake", "like"], home: ["hole", "hose"], cute: ["cub", "cut"] };
      const choices = shuffle([probe].concat(others[probe] || ["mat", "sun"]));
      el.innerHTML = headerPlacement() + `<div class="rg-stage"><div class="rg-wordcard" data-mode="audio">
        <button class="rg-earbtn" data-hear-word="${probe}">🔊</button>
        <p class="rg-prompt">Tap the word you hear</p>
        <div class="rg-choices">${choices.map(w =>
          `<button class="rg-choice rg-choice-word" data-pick="${w}" data-answer="${probe}">${w}</button>`).join("")}</div>
      </div></div>`;
      RGAudio.word(probe);
    }
    el.querySelector("#rgExit").addEventListener("click", closeOverlay);
    el.querySelectorAll("[data-hear-g]").forEach(b => b.addEventListener("click", () => RGAudio.phoneme(b.dataset.hearG)));
    el.querySelectorAll("[data-hear-word]").forEach(b => b.addEventListener("click", () => RGAudio.word(b.dataset.hearWord)));
    el.querySelectorAll(".rg-choice").forEach(b => b.addEventListener("click", onProbeTap));
  }

  function headerPlacement() {
    return `<div class="rg-top"><button class="rg-exit" id="rgExit">✕</button>
      <span class="rg-kid">Finding the starting spot…</span></div>`;
  }

  function onProbeTap(e) {
    if (S.answered) return;
    S.answered = true;
    const btn = e.currentTarget;
    const correct = (btn.dataset.pick || "").toLowerCase() === (btn.dataset.answer || "").toLowerCase();
    const fast = (Date.now() - S.shownAt) < 7000;
    if (correct) { btn.classList.add("rg-right"); RGAudio.chime(); }
    else btn.classList.add("rg-dim");
    if (correct && fast) S.stageCorrect++;
    S.probeIdx++;
    setTimeout(renderProbe, 450);
  }

  function finishPlacement(landLessonId) {
    const rg = S.rg;
    const kidId = S.kidId;
    const landIdx = Math.max(0, RG_LESSONS.findIndex(l => l.id === landLessonId));
    rg.lessonIdx = landIdx;
    rg.placed = true;
    // seed everything BEFORE the landing spot as known (box 3 — it still
    // gets reviewed and must prove itself up to box 4/5)
    for (let i = 0; i < landIdx; i++) {
      const L = RG_LESSONS[i];
      if (L.g && L.kind === "letter") { const it = item(rg, "g:" + L.g); it.box = Math.max(it.box, 3); it.seen = Math.max(it.seen, 1); it.last = todayISO(); }
      if (L.g) rg.introduced[L.g] = true;
      (L.words || []).forEach(w => { const it = item(rg, "w:" + w.toLowerCase()); it.box = Math.max(it.box, 3); it.seen = Math.max(it.seen, 1); it.last = todayISO(); });
    }
    saveState();
    const el = overlayEl();
    const L = RG_LESSONS[landIdx];
    el.innerHTML = `<div class="rg-win">
      <h1 class="rg-win-title">All set!</h1>
      <p class="rg-prompt">${kidName()} starts at <b>${L.label || ("the letter " + (L.g || "").toUpperCase())}</b></p>
      <div class="rg-win-btns">
        <button class="rg-btn rg-btn-go" id="rgPlayNow">Play the first game →</button>
        <button class="rg-btn" id="rgLater">Later</button>
      </div></div>`;
    el.querySelector("#rgPlayNow").addEventListener("click", () => startSession(kidId));
    el.querySelector("#rgLater").addEventListener("click", closeOverlay);
  }

  /* ---------------- parent-facing tab ---------------- */

  function renderTab(kid) {
    const rg = ensureRG(kid.id);
    const items = rg.items || {};
    const soundsMastered = Object.keys(items).filter(k => k.startsWith("g:") && items[k].box >= 4).length;
    const soundsTotal = RG_LESSONS.filter(l => l.kind === "letter").length;
    const wordsMastered = Object.keys(items).filter(k => !k.startsWith("g:") && items[k].box >= 4).length;
    const weekAgo = new Date(Date.now() - 6 * 86400000);
    const recent = rg.sessions.filter(s => new Date(s.date) >= weekAgo);
    const stuck = Object.keys(items)
      .filter(k => items[k].seen >= 3 && items[k].box <= 1 && items[k].lapses >= 2)
      .sort((a, b) => items[b].lapses - items[a].lapses).slice(0, 6);
    const L = lessonAt(rg.lessonIdx);
    const critters = rg.critters.map(id => { const l = RG_LESSONS.find(x => x.id === id); return l ? l.critter : null; }).filter(Boolean);

    return `
    <div class="rg-tab">
      <div class="rg-hero card">
        <div>
          <h2 style="margin:0 0 4px">🎮 Reading Game</h2>
          <p class="muted" style="margin:0">Phonics flashcards for ${kid.name} — sounds first, no guessing, critters as you go.</p>
        </div>
        <div class="rg-hero-btns">
          ${rg.placed
        ? `<button class="btn btn-primary btn-lg" id="rgStartBtn">▶ Start ${kid.name}'s session</button>
             <button class="btn btn-ghost" id="rgReplaceBtn" title="Re-run the placement check">Re-place</button>`
        : `<button class="btn btn-primary btn-lg" id="rgPlaceBtn">🚀 First time — find ${kid.name}'s starting spot</button>`}
        </div>
      </div>

      <div class="rg-statrow">
        <div class="card rg-stat"><div class="rg-stat-num">${soundsMastered}<span class="muted">/${soundsTotal}</span></div><div class="rg-stat-label">letter sounds mastered</div></div>
        <div class="card rg-stat"><div class="rg-stat-num">${wordsMastered}</div><div class="rg-stat-label">words mastered</div></div>
        <div class="card rg-stat"><div class="rg-stat-num">${recent.length}</div><div class="rg-stat-label">sessions this week</div></div>
        <div class="card rg-stat"><div class="rg-stat-num">${critters.length}</div><div class="rg-stat-label">critters hatched</div></div>
      </div>

      <div class="card">
        <h3 style="margin-top:0">Now learning: ${L ? (L.label || "letter " + (L.g || "").toUpperCase()) : "—"}</h3>
        ${stuck.length ? `<p class="muted">Needs extra love: ${stuck.map(k =>
          `<span class="rg-stuck">${k.startsWith("g:") ? k.slice(2).toUpperCase() + " sound" : k.slice(2)}</span>`).join(" ")}</p>`
        : `<p class="muted">Nothing stuck right now — smooth sailing.</p>`}
      </div>

      <div class="card">
        <h3 style="margin-top:0">🥚 Critter shelf</h3>
        ${critters.length
        ? `<div class="rg-shelf">${critters.map(c => `<div class="rg-shelf-critter" title="${c.n}"><span>${c.e}</span><small>${c.n.split(" ")[0]}</small></div>`).join("")}</div>`
        : `<p class="muted">No critters yet — they hatch when a skill is fully mastered. First one's coming soon!</p>`}
      </div>
    </div>`;
  }

  function attachTab(kid) {
    const s = document.getElementById("rgStartBtn");
    if (s) s.addEventListener("click", () => startSession(kid.id));
    const p = document.getElementById("rgPlaceBtn");
    if (p) p.addEventListener("click", () => startPlacement(kid.id));
    const r = document.getElementById("rgReplaceBtn");
    if (r) r.addEventListener("click", () => startPlacement(kid.id));
  }

  window.ReadingGame = { renderTab, attachTab, startSession, startPlacement };
})();
