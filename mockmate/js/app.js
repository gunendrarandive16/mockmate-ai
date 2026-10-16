/* MockMate app logic – vanilla JS, data in localStorage */
(function () {
  "use strict";

  /* ---------- storage ---------- */
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem("mm_" + k)) ?? d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("mm_" + k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  };
  let history = store.get("history", []);
  let bookmarks = store.get("bookmarks", []);

  const $app = document.getElementById("app");
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const catById = id => CATEGORIES.find(c => c.id === id);
  const qById = id => QUESTIONS.find(q => q.id === id);
  const fmt = s => String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  let timerId = null, recog = null;
  function cleanup() {
    clearInterval(timerId); timerId = null;
    if (recog) { try { recog.stop(); } catch (e) { /* ignore */ } recog = null; }
  }

  /* ---------- theme ---------- */
  function applyTheme(t) { document.documentElement.setAttribute("data-theme", t); store.set("theme", t); }
  applyTheme(store.get("theme", window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  document.getElementById("themeToggle").addEventListener("click", () => {
    applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
  });

  /* ---------- analysis ---------- */
  function analyze(text, q) {
    const lower = " " + text.toLowerCase().replace(/[^a-z0-9()\s'-]/g, " ") + " ";
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const hits = [], misses = [];
    q.keywords.forEach(k => (text.toLowerCase().includes(k.toLowerCase()) ? hits : misses).push(k));
    let fillerCount = 0; const fillersFound = {};
    FILLERS.forEach(f => {
      const m = lower.match(new RegExp("\\s" + f.replace(/\s+/g, "\\s+") + "(?=\\s)", "g"));
      if (m) { fillerCount += m.length; fillersFound[f] = m.length; }
    });
    const coverage = q.keywords.length ? hits.length / q.keywords.length : 0;
    let lengthScore = 0;
    if (words >= 60 && words <= 220) lengthScore = 1;
    else if (words < 60) lengthScore = words / 60;
    else lengthScore = Math.max(0.5, 1 - (words - 220) / 400);
    const fillerRate = words ? fillerCount / words : 0;
    const fillerScore = Math.max(0, 1 - fillerRate * 12);
    const score = Math.round((coverage * 55 + lengthScore * 30 + fillerScore * 15));
    const star = q.cat === "behavioral" ? ["situation", "task", "action", "result"].filter(w => lower.includes(" " + w)).length : null;

    const notes = [];
    if (words === 0) notes.push("No answer recorded — even a rough attempt helps. Try speaking your answer aloud.");
    else {
      if (words < 40) notes.push("Your answer is short. Aim for 60–200 words (about 30–90 seconds spoken).");
      if (words > 250) notes.push("Your answer is long. Tighten it and lead with the key point.");
      if (coverage < 0.4) notes.push("Few key concepts were covered. Review the missed keywords below.");
      else if (coverage >= 0.7) notes.push("Strong concept coverage — nice.");
      if (fillerCount >= 4) notes.push("You used filler words " + fillerCount + " times. Pause silently instead.");
      if (star !== null && star < 3) notes.push("Structure with STAR (Situation, Task, Action, Result) for clearer storytelling.");
      if (!/\d/.test(text) && q.cat === "behavioral") notes.push("Add a number or measurable result to make impact concrete.");
    }
    return { words, hits, misses, fillerCount, fillersFound, score, notes };
  }

  /* ---------- navigation ---------- */
  function go(view, params) {
    cleanup();
    document.querySelectorAll("#nav button[data-nav]").forEach(b => b.classList.toggle("active", b.dataset.nav === view));
    ({ dashboard, practice, interview, bookmarks: bookmarksView, history: historyView }[view] || dashboard)(params || {});
    window.scrollTo(0, 0);
  }
  document.addEventListener("click", e => {
    const t = e.target.closest("[data-nav]");
    if (t) go(t.dataset.nav);
  });

  /* ---------- dashboard ---------- */
  function dashboard() {
    const n = history.length;
    const avg = n ? Math.round(history.reduce((a, h) => a + h.score, 0) / n) : 0;
    const streak = calcStreak();
    const byCat = CATEGORIES.map(c => {
      const hs = history.filter(h => h.cat === c.id);
      return { c, n: hs.length, avg: hs.length ? Math.round(hs.reduce((a, h) => a + h.score, 0) / hs.length) : 0 };
    });
    const last7 = lastDays(7);
    const max = Math.max(1, ...last7.map(d => d.count));

    $app.innerHTML = `
      <h1>Welcome back 👋</h1>
      <p class="sub">Practice out loud, get instant feedback, and track your progress.</p>
      <div class="grid stats">
        <div class="card stat"><div class="num">${n}</div><div class="lbl">Answers practiced</div></div>
        <div class="card stat"><div class="num">${avg}</div><div class="lbl">Average score</div></div>
        <div class="card stat"><div class="num">${streak}🔥</div><div class="lbl">Day streak</div></div>
        <div class="card stat"><div class="num">${bookmarks.length}</div><div class="lbl">Saved questions</div></div>
      </div>
      <div class="card">
        <h2>Last 7 days</h2>
        <div class="bar-chart">${last7.map(d => `<div class="bar" style="height:${(d.count / max) * 100}%"><span>${d.count}</span></div>`).join("")}</div>
        <div class="row" style="justify-content:space-between;color:var(--muted);font-size:.78rem;margin-top:6px">${last7.map(d => `<span style="flex:1;text-align:center">${d.label}</span>`).join("")}</div>
      </div>
      <h2>Practice by category</h2>
      <div class="grid cats">
        ${byCat.map(x => `
          <div class="card cat-card" data-cat="${x.c.id}">
            <div class="ico">${x.c.icon}</div>
            <h2 style="margin:6px 0">${esc(x.c.name)}</h2>
            <div class="sub" style="margin:0 0 8px;font-size:.9rem">${esc(x.c.desc)}</div>
            <span class="tag">${QUESTIONS.filter(q => q.cat === x.c.id).length} questions</span>
            <span class="tag">${x.n ? "avg " + x.avg : "not started"}</span>
          </div>`).join("")}
      </div>
      <div class="row" style="margin-top:8px">
        <button class="btn" data-nav="interview">Start a mock interview</button>
        <button class="btn ghost" data-nav="practice">Free practice</button>
      </div>`;
    $app.querySelectorAll(".cat-card").forEach(el => el.addEventListener("click", () => go("practice", { cat: el.dataset.cat })));
  }

  function dayKey(d) { return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
  function lastDays(n) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      out.push({ label: d.toLocaleDateString(undefined, { weekday: "short" }), count: history.filter(h => dayKey(new Date(h.date)) === dayKey(d)).length });
    }
    return out;
  }
  function calcStreak() {
    const days = new Set(history.map(h => dayKey(new Date(h.date))));
    let s = 0; const d = new Date();
    if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
    while (days.has(dayKey(d))) { s++; d.setDate(d.getDate() - 1); }
    return s;
  }

  /* ---------- shared answer UI ---------- */
  function speechSupported() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }
  function attachMic(btn, ta) {
    if (!speechSupported()) { btn.disabled = true; btn.title = "Voice dictation isn't supported in this browser (try Chrome)."; btn.textContent = "🎤 Not supported"; return; }
    let on = false;
    btn.addEventListener("click", () => {
      if (on) { recog && recog.stop(); return; }
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      recog = new SR(); recog.continuous = true; recog.interimResults = false; recog.lang = "en-US";
      const base = ta.value ? ta.value.trim() + " " : "";
      let finalText = "";
      recog.onresult = ev => {
        finalText = "";
        for (let i = 0; i < ev.results.length; i++) finalText += ev.results[i][0].transcript + " ";
        ta.value = base + finalText.trim();
      };
      recog.onstart = () => { on = true; btn.classList.add("rec"); btn.textContent = "⏹ Stop dictation"; };
      recog.onend = () => { on = false; btn.classList.remove("rec"); btn.textContent = "🎤 Dictate"; recog = null; };
      recog.onerror = () => { try { recog.stop(); } catch (e) { /* ignore */ } };
      recog.start();
    });
  }

  function feedbackHTML(q, a, extra) {
    const cls = a.score >= 70 ? "var(--accent)" : a.score >= 45 ? "var(--warn)" : "var(--danger)";
    const fillers = Object.entries(a.fillersFound).map(([k, v]) => `"${esc(k)}" ×${v}`).join(", ");
    return `
      <div class="card">
        <div class="row between">
          <div><div class="lbl" style="color:var(--muted)">Answer score</div><div class="score-big" style="color:${cls}">${a.score}<span style="font-size:1.1rem;color:var(--muted)">/100</span></div></div>
          <div style="text-align:right;color:var(--muted)">${a.words} words<br>${a.fillerCount} filler${a.fillerCount === 1 ? "" : "s"}${extra ? "<br>" + extra : ""}</div>
        </div>
        ${a.hits.length || a.misses.length ? `<h2 style="margin-top:14px">Key concepts</h2>
        <div class="chips">${a.hits.map(k => `<span class="chip hit">✓ ${esc(k)}</span>`).join("")}${a.misses.map(k => `<span class="chip miss">✗ ${esc(k)}</span>`).join("")}</div>` : ""}
        ${fillers ? `<div class="sub" style="margin-top:8px">Filler words: ${fillers}</div>` : ""}
        ${a.notes.map(n => `<div class="tip">${esc(n)}</div>`).join("")}
      </div>
      <div class="card"><h2>💡 Tip</h2><div class="tip">${esc(q.tip)}</div>
        <h2 style="margin-top:14px">Model answer outline</h2><div class="tip model">${esc(q.model)}</div></div>`;
  }

  function saveResult(q, a, mode, seconds, text) {
    history.unshift({ id: Date.now() + Math.random(), qid: q.id, cat: q.cat, q: q.q, score: a.score, words: a.words, seconds: seconds || 0, mode, answer: text.slice(0, 3000), date: new Date().toISOString() });
    history = history.slice(0, 500);
    store.set("history", history);
  }
  function toggleBookmark(id) {
    bookmarks = bookmarks.includes(id) ? bookmarks.filter(x => x !== id) : bookmarks.concat(id);
    store.set("bookmarks", bookmarks);
  }

  /* ---------- practice ---------- */
  function practice(p) {
    const filt = { cat: p.cat || "all", diff: p.diff || "all" };
    $app.innerHTML = `
      <h1>Practice</h1><p class="sub">Pick a topic, answer in your own words (type or dictate), and get feedback.</p>
      <div class="card">
        <div class="form-grid">
          <div><label>Category</label><select id="fCat"><option value="all">All categories</option>${CATEGORIES.map(c => `<option value="${c.id}" ${c.id === filt.cat ? "selected" : ""}>${c.icon} ${esc(c.name)}</option>`).join("")}</select></div>
          <div><label>Difficulty</label><select id="fDiff">${["all", "easy", "medium", "hard"].map(d => `<option value="${d}" ${d === filt.diff ? "selected" : ""}>${d === "all" ? "Any difficulty" : d[0].toUpperCase() + d.slice(1)}</option>`).join("")}</select></div>
        </div>
        <button class="btn" id="startP">Get a question</button>
      </div>
      <div id="pArea"></div>`;
    const pick = () => {
      const pool = QUESTIONS.filter(q => (fCat.value === "all" || q.cat === fCat.value) && (fDiff.value === "all" || q.diff === fDiff.value));
      if (!pool.length) { pArea.innerHTML = `<div class="card empty">No questions match these filters.</div>`; return; }
      const seen = practice.last;
      const choices = pool.length > 1 ? pool.filter(q => q.id !== seen) : pool;
      showQuestion(choices[Math.floor(Math.random() * choices.length)]);
    };
    document.getElementById("startP").addEventListener("click", pick);
    if (p.qid) showQuestion(qById(p.qid)); else if (p.cat) pick();
  }

  function showQuestion(q) {
    cleanup();
    practice.last = q.id;
    const area = document.getElementById("pArea");
    let sec = 0;
    area.innerHTML = `
      <div class="card">
        <div class="row between"><div><span class="tag">${esc(catById(q.cat).name)}</span> <span class="tag ${q.diff}">${q.diff}</span></div><div class="timer" id="stopw">00:00</div></div>
        <div class="q-text">${esc(q.q)}</div>
        <textarea id="ans" placeholder="Type your answer, or press Dictate and speak it…"></textarea>
        <div class="row" style="margin-top:12px">
          <button class="btn ghost mic" id="mic">🎤 Dictate</button>
          <button class="btn green" id="submit">Submit answer</button>
          <button class="btn ghost" id="bm">${bookmarks.includes(q.id) ? "★ Saved" : "☆ Save"}</button>
          <button class="btn ghost" id="skip">Skip</button>
        </div>
      </div>
      <div id="fb"></div>`;
    const ta = document.getElementById("ans");
    timerId = setInterval(() => { sec++; const el = document.getElementById("stopw"); if (el) el.textContent = fmt(sec); }, 1000);
    attachMic(document.getElementById("mic"), ta);
    document.getElementById("bm").addEventListener("click", e => { toggleBookmark(q.id); e.target.textContent = bookmarks.includes(q.id) ? "★ Saved" : "☆ Save"; });
    document.getElementById("skip").addEventListener("click", () => { cleanup(); document.getElementById("startP").click(); });
    document.getElementById("submit").addEventListener("click", () => {
      cleanup();
      const text = ta.value;
      const a = analyze(text, q);
      saveResult(q, a, "practice", sec, text);
      ta.disabled = true;
      document.getElementById("submit").disabled = true;
      document.getElementById("mic").disabled = true;
      document.getElementById("fb").innerHTML = feedbackHTML(q, a, "Time " + fmt(sec)) + `<button class="btn" id="nextQ">Next question →</button>`;
      document.getElementById("nextQ").addEventListener("click", () => document.getElementById("startP").click());
    });
  }

  /* ---------- mock interview ---------- */
  function interview() {
    $app.innerHTML = `
      <h1>Mock Interview</h1><p class="sub">A timed session of random questions. Each answer auto-submits when time runs out.</p>
      <div class="card">
        <div class="form-grid">
          <div><label>Focus</label><select id="iCat"><option value="all">Mixed</option>${CATEGORIES.map(c => `<option value="${c.id}">${c.icon} ${esc(c.name)}</option>`).join("")}</select></div>
          <div><label>Questions</label><select id="iN"><option>3</option><option selected>5</option><option>8</option><option>10</option></select></div>
          <div><label>Seconds per answer</label><select id="iT"><option value="60">60</option><option value="90" selected>90</option><option value="120">120</option><option value="180">180</option></select></div>
        </div>
        <button class="btn" id="begin">Begin interview</button>
      </div>`;
    document.getElementById("begin").addEventListener("click", () => {
      const cat = iCat.value, n = +iN.value, t = +iT.value;
      const pool = QUESTIONS.filter(q => cat === "all" || q.cat === cat);
      runInterview(shuffle(pool).slice(0, n), t);
    });
  }

  function runInterview(qs, limit) {
    let idx = 0; const results = [];
    const next = () => {
      cleanup();
      if (idx >= qs.length) return finish();
      const q = qs[idx]; let left = limit; let done = false;
      $app.innerHTML = `
        <div class="progress"><div style="width:${(idx / qs.length) * 100}%"></div></div>
        <div class="card">
          <div class="row between"><div>Question ${idx + 1} of ${qs.length} · <span class="tag">${esc(catById(q.cat).name)}</span></div><div class="timer" id="cd">${fmt(left)}</div></div>
          <div class="q-text">${esc(q.q)}</div>
          <textarea id="ans" placeholder="Answer as you would in a real interview…" autofocus></textarea>
          <div class="row" style="margin-top:12px">
            <button class="btn ghost mic" id="mic">🎤 Dictate</button>
            <button class="btn green" id="done">${idx + 1 === qs.length ? "Finish" : "Submit & next"}</button>
          </div>
        </div>`;
      const ta = document.getElementById("ans");
      attachMic(document.getElementById("mic"), ta);
      const submit = () => {
        if (done) return; done = true; cleanup();
        const text = ta.value, a = analyze(text, q);
        saveResult(q, a, "interview", limit - left, text);
        results.push({ q, a, text }); idx++; next();
      };
      timerId = setInterval(() => {
        left--; const el = document.getElementById("cd");
        if (el) { el.textContent = fmt(Math.max(left, 0)); el.classList.toggle("low", left <= 10); }
        if (left <= 0) submit();
      }, 1000);
      document.getElementById("done").addEventListener("click", submit);
    };
    const finish = () => {
      const avg = results.length ? Math.round(results.reduce((s, r) => s + r.a.score, 0) / results.length) : 0;
      const verdict = avg >= 70 ? "Interview-ready 🎉" : avg >= 45 ? "Getting there 💪" : "Keep practicing 📚";
      $app.innerHTML = `
        <h1>Interview complete</h1>
        <div class="card" style="text-align:center"><div class="score-big">${avg}</div><div class="sub">Average score · ${verdict}</div></div>
        ${results.map((r, i) => `
          <details class="card" ${r.a.score < 45 ? "open" : ""}>
            <summary><b>${i + 1}. ${esc(r.q.q)}</b> — <span class="tag">${r.a.score}/100</span></summary>
            <div style="margin-top:12px">${feedbackHTML(r.q, r.a)}</div>
          </details>`).join("")}
        <div class="row"><button class="btn" data-nav="interview">New interview</button><button class="btn ghost" data-nav="dashboard">Dashboard</button></div>`;
    };
    next();
  }

  /* ---------- bookmarks ---------- */
  function bookmarksView() {
    const list = bookmarks.map(qById).filter(Boolean);
    $app.innerHTML = `<h1>Saved questions</h1><p class="sub">Questions you want to revisit.</p>` +
      (list.length ? list.map(q => `
        <div class="card"><div class="row between">
          <div><span class="tag">${esc(catById(q.cat).name)}</span> <span class="tag ${q.diff}">${q.diff}</span><div style="font-weight:700;margin-top:6px">${esc(q.q)}</div></div>
          <div class="row"><button class="btn" data-practice="${q.id}">Practice</button><button class="btn ghost" data-remove="${q.id}">Remove</button></div>
        </div></div>`).join("") : `<div class="card empty">Nothing saved yet. Tap ☆ Save while practicing.</div>`);
    $app.querySelectorAll("[data-practice]").forEach(b => b.addEventListener("click", () => go("practice", { qid: b.dataset.practice })));
    $app.querySelectorAll("[data-remove]").forEach(b => b.addEventListener("click", () => { toggleBookmark(b.dataset.remove); bookmarksView(); }));
  }

  /* ---------- history ---------- */
  function historyView() {
    $app.innerHTML = `
      <div class="row between"><div><h1>History</h1><p class="sub">Your most recent answers.</p></div>
      ${history.length ? `<button class="btn red" id="clr">Clear all</button>` : ""}</div>` +
      (history.length ? `<div class="card" style="overflow-x:auto"><table>
        <thead><tr><th>Date</th><th>Question</th><th>Mode</th><th>Score</th><th>Words</th></tr></thead>
        <tbody>${history.slice(0, 100).map(h => `<tr>
          <td>${new Date(h.date).toLocaleDateString()}</td><td>${esc(h.q)}</td><td>${esc(h.mode)}</td>
          <td><span class="tag">${h.score}</span></td><td>${h.words}</td></tr>`).join("")}</tbody></table></div>`
        : `<div class="card empty">No attempts yet. Head to Practice to get started.</div>`);
    const c = document.getElementById("clr");
    if (c) c.addEventListener("click", () => { if (confirm("Delete all history?")) { history = []; store.set("history", history); historyView(); } });
  }

  go("dashboard");
})();
