/* ============================================================
   Spell Engine Library — エンジンページのアプリ本体
   /ue/ /unity/ … 共通。window.SEL_PAGE で各ページの設定を渡す。
     window.SEL_PAGE = {
       engineId: "ue",            // ENGINES 登録簿の id
       meta: { title, siteName, description, url, image },
       ui:   { h1, subtitle, footer, repoUrl },
     }
   ============================================================ */
(function(){
  "use strict";

  const SEL = window.SEL;
  const SEL_PAGE = window.SEL_PAGE || {};
  const { escapeHtml, CONFIG } = SEL;

  const ENGINE_ID = SEL_PAGE.engineId;                 // "ue" / "unity" / ...
  const engineDef = SEL.engineById(ENGINE_ID) || {};
  const WEAK_KEY = "sel_weakWords_v1";                 // 全エンジン共通の入れ物。キーは ENGINE_ID を前置して分離
  const OLD_WEAK_KEY = "ueTypingTerms_weakWords_v1";   // UE の旧ツールのキー(UE版のみ移行対象)
  const PROGRESS_KEY = "sel_wordProgress_v1";
  const SET_SIZE = CONFIG.setSize;

  const WORD_STATUS = {
    unseen:    { key: "unseen",    label: "未出題",   cls: "st-unseen" },
    learning:  { key: "learning",  label: "学習中",   cls: "st-learning" },
    graduated: { key: "graduated", label: "卒業",     cls: "st-graduated" },
    cleared:   { key: "cleared",   label: "正解済み", cls: "st-cleared" },
  };

  const IS_TOUCH = (window.matchMedia && window.matchMedia("(hover: none) and (pointer: coarse)").matches)
    || navigator.maxTouchPoints > 0
    || "ontouchstart" in window;

  let ALL_WORDS = [];
  let state = null;

  /* ---------------------------------------------------------
   * 画面 (screens) の HTML — 全エンジンページ共通。
   * --------------------------------------------------------- */
  const SCREENS_HTML = `
  <header>
    <nav class="page-nav" id="page-nav"></nav>
    <h1 id="app-title"></h1>
    <p id="app-subtitle"></p>
  </header>

  <section id="screen-setup" class="card">
    <div class="field">
      <label class="field-title">モード</label>
      <div class="mode-toggle">
        <label id="mode-typing-label">
          <input type="radio" name="mode" value="typing" checked>
          <span>タイピングモード<span class="desc">意味を見て英単語を打つ</span></span>
        </label>
        <label id="mode-choice-label">
          <input type="radio" name="mode" value="choice">
          <span>4択モード<span class="desc">英単語を見て意味を選ぶ</span></span>
        </label>
      </div>
      <p class="mode-note" id="mode-note" hidden>タッチデバイスを検出しました。タイピングモードはソフトキーボードで画面が隠れるため、PC推奨です。</p>
    </div>

    <div class="field">
      <label class="field-title">カテゴリ</label>
      <div class="chip-group" id="category-container"></div>
    </div>

    <div class="field">
      <label class="field-title">難易度</label>
      <div class="chip-group" id="level-container"></div>
    </div>

    <div class="field">
      <label class="toggle-row">
        <input type="checkbox" id="priority-checkbox" checked>
        苦手な単語を優先的に出題する
      </label>
    </div>

    <div class="pool-info" id="pool-info">読み込み中...</div>

    <div class="field" style="margin-top:18px;margin-bottom:0;display:flex;gap:10px;">
      <button class="btn btn-ghost" id="dict-btn" type="button" style="flex:1;">📖 単語一覧</button>
      <button class="btn btn-ghost" id="weak-book-btn" type="button" style="flex:1;">📓 苦手単語帳</button>
    </div>

    <div class="setup-footer">
      <button class="btn btn-ghost btn-small" id="reset-weak-btn" type="button">苦手リストをリセット</button>
      <button class="btn btn-primary" id="start-btn" type="button" disabled style="width:auto;flex:1;">はじめる</button>
    </div>
  </section>

  <section id="screen-game" class="card" hidden>
    <div class="game-top">
      <button class="btn btn-ghost btn-small" id="quit-btn" type="button">✕ 中断</button>
      <div class="progress-bar"><div id="progress-fill"></div></div>
      <span id="progress-text">1 / 10</span>
    </div>
    <div class="tag-row"><span class="tag" id="q-tag"></span></div>

    <div id="typing-area" class="q-area" hidden>
      <div class="meaning" id="q-meaning"></div>
      <div class="note-hint" id="q-note"></div>
      <div class="letters" id="letters"></div>
      <div class="hint-line">
        英単語をキーボードで入力(大文字・小文字は区別しません)<br>
        分からない単語は <kbd>Esc</kbd> でスキップ(正解の綴りが表示されます)
      </div>
    </div>

    <div id="choice-area" class="q-area" hidden>
      <div class="word-en" id="q-word-en"></div>
      <div class="choices" id="choices"></div>
      <div class="hint-line">正しい意味を選んでください</div>
    </div>

    <div id="reveal-area" class="q-area reveal" hidden>
      <div class="reveal-badge" id="reveal-badge"></div>
      <div class="reveal-word" id="reveal-word"></div>
      <div class="reveal-ja" id="reveal-ja"></div>
      <div class="reveal-block" id="reveal-where" hidden>
        <div class="reveal-h">どこで使う</div>
        <div class="reveal-body" id="reveal-where-body"></div>
      </div>
      <div class="reveal-block" id="reveal-phrase" hidden>
        <div class="reveal-h">実際の表記</div>
        <div class="reveal-body" id="reveal-phrase-body"></div>
      </div>
      <div id="reveal-xref" hidden></div>
      <div class="reveal-cont" id="reveal-cont"></div>
    </div>
  </section>

  <section id="screen-result" class="card" hidden>
    <div class="result-stats">
      <div class="stat-box">
        <div class="val" id="result-accuracy">0%</div>
        <div class="label">正答率</div>
      </div>
      <div class="stat-box">
        <div class="val" id="result-correct">0 / 0</div>
        <div class="label">ノーミスで正解</div>
      </div>
    </div>
    <div class="sub-stats">
      <div>WPM <b id="result-wpm">0</b> <span id="result-wpm-label"></span></div>
      <div>所要時間 <b id="result-time">0:00</b></div>
      <div>スキップ <b id="result-skipped">0</b>問</div>
      <div>ミスあり <b id="result-missed">0</b>問</div>
    </div>

    <div class="missed-section">
      <h3>今回間違えた・スキップした単語</h3>
      <div class="missed-list" id="missed-list"></div>
    </div>

    <div class="pool-info" id="weak-total-info"></div>

    <div class="result-footer" style="margin-top:20px;">
      <button class="btn btn-ghost" id="back-btn" type="button">設定に戻る</button>
      <button class="btn btn-primary" id="retry-btn" type="button">もう一度</button>
    </div>
  </section>

  <section id="screen-weak" class="card" hidden>
    <h2>📓 苦手単語帳</h2>
    <p class="weak-sub">ミス回数の多い順。行をクリックすると解説が開きます。</p>
    <div class="weak-list" id="weak-list"></div>
    <div class="weak-empty" id="weak-empty" hidden>まだ苦手な単語はありません。<br>プレイして間違えた単語がここにたまっていきます。</div>
    <div class="result-footer" style="margin-top:20px;">
      <button class="btn btn-ghost" id="weak-back-btn" type="button">設定に戻る</button>
      <button class="btn btn-ghost" id="weak-reset-btn" type="button">苦手リストをリセット</button>
    </div>
  </section>

  <section id="screen-dict" class="card" hidden>
    <h2>📖 単語一覧</h2>
    <p class="dict-progress" id="dict-progress"></p>
    <input type="search" id="dict-search" class="dict-search" autocomplete="off"
           placeholder="検索: 英語・日本語・解説・ノード名・他エンジンでの呼び方">
    <div class="dict-filters">
      <div class="chip-group" id="dict-cat"></div>
      <div class="chip-group" id="dict-lvl"></div>
      <div class="chip-group" id="dict-status"></div>
    </div>
    <div class="dict-count" id="dict-count"></div>
    <div class="weak-list" id="dict-list"></div>
    <div class="weak-empty" id="dict-empty" hidden>該当する単語がありません。</div>
    <div class="result-footer" style="margin-top:20px;">
      <button class="btn btn-ghost" id="dict-back-btn" type="button">設定に戻る</button>
    </div>
  </section>

  <footer id="app-footer">
    <p id="footer-text"></p>
    <p><a id="footer-repo" target="_blank" rel="noopener noreferrer">GitHub リポジトリ</a></p>
  </footer>`;

  const appEl = document.getElementById("app");
  appEl.innerHTML = SCREENS_HTML;

  /* ---------- DOM refs ---------- */
  const screens = {
    setup:  document.getElementById("screen-setup"),
    game:   document.getElementById("screen-game"),
    result: document.getElementById("screen-result"),
    weak:   document.getElementById("screen-weak"),
    dict:   document.getElementById("screen-dict"),
  };
  const categoryContainer = document.getElementById("category-container");
  const levelContainer = document.getElementById("level-container");
  const priorityCheckbox = document.getElementById("priority-checkbox");
  const poolInfo = document.getElementById("pool-info");
  const startBtn = document.getElementById("start-btn");
  const resetWeakBtn = document.getElementById("reset-weak-btn");
  const weakBookBtn = document.getElementById("weak-book-btn");

  const weakListEl = document.getElementById("weak-list");
  const weakEmptyEl = document.getElementById("weak-empty");
  const weakBackBtn = document.getElementById("weak-back-btn");
  const weakResetBtn = document.getElementById("weak-reset-btn");

  const dictBtn = document.getElementById("dict-btn");
  const dictProgressEl = document.getElementById("dict-progress");
  const dictSearchEl = document.getElementById("dict-search");
  const dictCatEl = document.getElementById("dict-cat");
  const dictLvlEl = document.getElementById("dict-lvl");
  const dictStatusEl = document.getElementById("dict-status");
  const dictCountEl = document.getElementById("dict-count");
  const dictListEl = document.getElementById("dict-list");
  const dictEmptyEl = document.getElementById("dict-empty");
  const dictBackBtn = document.getElementById("dict-back-btn");

  const quitBtn = document.getElementById("quit-btn");
  const progressFill = document.getElementById("progress-fill");
  const progressText = document.getElementById("progress-text");
  const qTag = document.getElementById("q-tag");
  const typingArea = document.getElementById("typing-area");
  const choiceArea = document.getElementById("choice-area");
  const qMeaning = document.getElementById("q-meaning");
  const qNote = document.getElementById("q-note");
  const lettersEl = document.getElementById("letters");
  const qWordEn = document.getElementById("q-word-en");
  const choicesEl = document.getElementById("choices");

  const revealArea = document.getElementById("reveal-area");
  const revealBadge = document.getElementById("reveal-badge");
  const revealWord = document.getElementById("reveal-word");
  const revealJa = document.getElementById("reveal-ja");
  const revealWhere = document.getElementById("reveal-where");
  const revealWhereBody = document.getElementById("reveal-where-body");
  const revealPhrase = document.getElementById("reveal-phrase");
  const revealPhraseBody = document.getElementById("reveal-phrase-body");
  const revealXref = document.getElementById("reveal-xref");
  const revealCont = document.getElementById("reveal-cont");

  const resultWpm = document.getElementById("result-wpm");
  const resultWpmLabel = document.getElementById("result-wpm-label");
  const resultAccuracy = document.getElementById("result-accuracy");
  const resultCorrect = document.getElementById("result-correct");
  const resultMissed = document.getElementById("result-missed");
  const resultSkipped = document.getElementById("result-skipped");
  const resultTime = document.getElementById("result-time");
  const missedList = document.getElementById("missed-list");
  const weakTotalInfo = document.getElementById("weak-total-info");
  const backBtn = document.getElementById("back-btn");
  const retryBtn = document.getElementById("retry-btn");

  /* ---------- utils ---------- */
  function shuffle(arr){
    const a = arr.slice();
    for(let i=a.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [a[i],a[j]] = [a[j],a[i]];
    }
    return a;
  }
  function showScreen(name){
    Object.keys(screens).forEach(k=>{ screens[k].hidden = (k!==name); });
  }
  function formatTime(sec){
    const m = Math.floor(sec/60);
    const s = Math.floor(sec%60);
    return m + ":" + String(s).padStart(2,"0");
  }

  /* ---------- 苦手リスト (localStorage) ----------
   * 記録形式: { "ue:89": { miss, skip, clean }, "unity:1001": {...}, ... }
   * キーは ENGINE_ID を前置。各ページは自分の接頭辞の分だけを扱う。
   */
  function weakIdFor(word){ return ENGINE_ID + ":" + word.id; }
  function isMyKey(key){ return key.indexOf(ENGINE_ID + ":") === 0; }
  function normalizeEntry(raw){
    raw = raw || {};
    return {
      miss:  Number(raw.miss)  || 0,
      skip:  Number(raw.skip)  || 0,
      clean: Number(raw.clean) || 0,
    };
  }
  function weakScore(entry){
    const e = normalizeEntry(entry);
    return e.miss + e.skip;
  }
  function loadWeak(){
    try{
      const raw = localStorage.getItem(WEAK_KEY);
      const obj = raw ? JSON.parse(raw) : {};
      return (obj && typeof obj === "object") ? obj : {};
    }catch(e){ return {}; }
  }
  function saveWeak(obj){
    try{ localStorage.setItem(WEAK_KEY, JSON.stringify(obj)); }catch(e){ /* quota */ }
  }
  function myWeakKeys(weak){ return Object.keys(weak).filter(isMyKey); }

  // UE の旧ツールのキーを新形式へ移行(UE版のみ)
  function migrateWeak(){
    if(ENGINE_ID !== "ue") return;
    let oldRaw;
    try{ oldRaw = localStorage.getItem(OLD_WEAK_KEY); }catch(e){ return; }
    if(oldRaw == null) return;
    try{
      const oldObj = JSON.parse(oldRaw) || {};
      const next = loadWeak();
      Object.keys(oldObj).forEach(id=>{
        const key = "ue:" + id;
        if(!next[key]) next[key] = { miss: Number(oldObj[id]) || 0, skip: 0, clean: 0 };
      });
      saveWeak(next);
    }catch(e){ /* 壊れた旧データは捨てる */ }
    try{ localStorage.removeItem(OLD_WEAK_KEY); }catch(e){}
  }

  /* ---------- 学習履歴 (出題済み / 卒業済み) ---------- */
  function loadProgress(){
    try{
      const raw = localStorage.getItem(PROGRESS_KEY);
      const obj = raw ? JSON.parse(raw) : {};
      return (obj && typeof obj === "object") ? obj : {};
    }catch(e){ return {}; }
  }
  function saveProgress(obj){
    try{ localStorage.setItem(PROGRESS_KEY, JSON.stringify(obj)); }catch(e){}
  }
  function markProgress(word, patch){
    const p = loadProgress();
    const key = weakIdFor(word);
    const cur = p[key] || {};
    let changed = false;
    Object.keys(patch).forEach(k=>{ if(cur[k] !== patch[k]){ cur[k] = patch[k]; changed = true; } });
    if(changed){ p[key] = cur; saveProgress(p); }
  }
  function wordStatus(word, weak, progress){
    const key = weakIdFor(word);
    if(weak[key]) return WORD_STATUS.learning;
    const p = progress[key] || {};
    if(p.graduated) return WORD_STATUS.graduated;
    if(p.seen) return WORD_STATUS.cleared;
    return WORD_STATUS.unseen;
  }

  /* ---------- setup screen ---------- */
  function getSelectedCategories(){
    return [...categoryContainer.querySelectorAll("input:checked")].map(i=>i.value);
  }
  function getSelectedLevels(){
    return [...levelContainer.querySelectorAll("input:checked")].map(i=>Number(i.value));
  }
  function getCurrentPool(){
    const cats = getSelectedCategories();
    const lvls = getSelectedLevels();
    return ALL_WORDS.filter(w=> cats.includes(w.category) && lvls.includes(w.level));
  }
  function buildFilterUI(){
    const cats = [...new Set(ALL_WORDS.map(w=>w.category))];
    const lvls = [...new Set(ALL_WORDS.map(w=>w.level))].sort((a,b)=>a-b);
    categoryContainer.innerHTML = cats.map(c=>
      `<label class="chip"><input type="checkbox" class="cat-check" value="${escapeHtml(c)}" checked>${escapeHtml(c)}</label>`
    ).join("");
    levelContainer.innerHTML = lvls.map(l=>
      `<label class="chip"><input type="checkbox" class="lvl-check" value="${l}" checked>Lv${l}</label>`
    ).join("");
    categoryContainer.addEventListener("change", updatePoolPreview);
    levelContainer.addEventListener("change", updatePoolPreview);
  }
  function updatePoolPreview(){
    const pool = getCurrentPool();
    const weak = loadWeak();
    const weakInPool = pool.filter(w=>weak[weakIdFor(w)]).length;
    if(pool.length===0){
      poolInfo.innerHTML = `<span class="warn">選択した条件に一致する単語がありません。カテゴリ/難易度を見直してください。</span>`;
      startBtn.disabled = true;
      return;
    }
    const setCount = Math.min(SET_SIZE, pool.length);
    poolInfo.innerHTML =
      `出題対象: <b>${pool.length}</b>語 (うち苦手 <b>${weakInPool}</b>語) / 1セット <b>${setCount}</b>問` +
      (pool.length < SET_SIZE ? `<br><span class="warn">対象が${SET_SIZE}語未満のため、今回は${setCount}問で出題します。</span>` : "");
    startBtn.disabled = false;
  }
  function resetWeakList(){
    if(!confirm("苦手リストをすべてリセットします。よろしいですか?\n(学習状況「出題済み・卒業済み」の記録は残ります)")) return;
    const weak = loadWeak();
    myWeakKeys(weak).forEach(k=> delete weak[k]); // 自分のエンジンの分だけ消す
    saveWeak(weak);
    if(ENGINE_ID === "ue"){ try{ localStorage.removeItem(OLD_WEAK_KEY); }catch(e){} }
    updatePoolPreview();
    if(!screens.weak.hidden) renderWeakBook();
    if(!screens.dict.hidden){ updateDictProgress(); renderDictionary(); }
  }

  /* ---------- question set building ---------- */
  function buildQuestionSet(pool, weakMap, usePriority){
    let arr = shuffle(pool);
    if(usePriority){
      arr = arr
        .map((w,i)=>({w, weight: weakScore(weakMap[weakIdFor(w)]), rand:i}))
        .sort((a,b)=> b.weight - a.weight || a.rand - b.rand)
        .map(x=>x.w);
    }
    return arr.slice(0, Math.min(SET_SIZE, arr.length));
  }

  /* ---------- weak list update ---------- */
  function recordResult(word, outcome){
    const weak = loadWeak();
    const key = weakIdFor(word);
    const existing = weak[key];

    if(outcome === "clean"){
      if(!existing) return false;
      const e = normalizeEntry(existing);
      e.clean += 1;
      let graduated = false;
      if(e.clean >= CONFIG.graduateCleanStreak){
        delete weak[key];
        graduated = true;
      }else{
        weak[key] = e;
      }
      saveWeak(weak);
      return graduated;
    }

    const e = existing ? normalizeEntry(existing) : { miss: 0, skip: 0, clean: 0 };
    if(outcome === "miss") e.miss = Math.min(e.miss + 1, CONFIG.missCap);
    else if(outcome === "skip") e.skip += 1;
    e.clean = 0;
    weak[key] = e;
    saveWeak(weak);
    return false;
  }

  /* ---------- game flow ---------- */
  function startGame(){
    const mode = document.querySelector('input[name="mode"]:checked').value;
    const pool = getCurrentPool();
    if(pool.length===0) return;
    const weak = loadWeak();
    const questions = buildQuestionSet(pool, weak, priorityCheckbox.checked);

    state = {
      mode, questions, index: 0,
      startTime: performance.now(),
      results: [],
      typedLen: 0, hadMistake: false, skipped: false,
      qStartTime: 0, qElapsedMs: 0,
      phase: "play", revealAt: 0,
    };

    showScreen("game");
    updateProgressUI();
    renderQuestion();
  }

  function teardownGameListeners(){
    document.removeEventListener("keydown", onTypingKeyDown);
    document.removeEventListener("keydown", onRevealKey);
    revealArea.removeEventListener("click", onRevealClick);
  }

  function updateProgressUI(){
    const total = state.questions.length;
    progressText.textContent = `${state.index+1} / ${total}`;
    progressFill.style.width = Math.round((state.index/total)*100) + "%";
  }
  function currentQuestion(){ return state.questions[state.index]; }

  function renderQuestion(){
    const q = currentQuestion();
    qTag.textContent = `${q.category} ・ Lv${q.level}`;
    state.hadMistake = false;
    state.skipped = false;
    state.phase = "play";
    state.qStartTime = performance.now();
    state.qElapsedMs = 0;

    typingArea.hidden = (state.mode !== "typing");
    choiceArea.hidden = (state.mode !== "choice");
    revealArea.hidden = true;

    if(state.mode === "typing"){
      document.removeEventListener("keydown", onTypingKeyDown);
      document.addEventListener("keydown", onTypingKeyDown);
      state.typedLen = 0;
      qMeaning.textContent = q.ja;
      qNote.textContent = q.note || "";
      lettersEl.innerHTML = "";
      for(const ch of q.en){
        const span = document.createElement("span");
        span.className = "letter" + (ch===" " ? " space" : "");
        span.textContent = "";
        lettersEl.appendChild(span);
      }
      if(lettersEl.firstChild) lettersEl.firstChild.classList.add("active");
    }else{
      qWordEn.textContent = q.en;
      const distractors = pickDistractors(q, 3);
      const options = shuffle([q, ...distractors]);
      choicesEl.innerHTML = "";
      options.forEach(opt=>{
        const btn = document.createElement("button");
        btn.className = "choice-btn";
        btn.type = "button";
        btn.textContent = opt.ja;
        btn.addEventListener("click", ()=> onChoiceClick(btn, opt, q));
        choicesEl.appendChild(btn);
      });
    }
  }

  function pickDistractors(q, n){
    const pool = ALL_WORDS.filter(w=> w.id!==q.id && w.ja!==q.ja);
    const sameCat = shuffle(pool.filter(w=>w.category===q.category));
    const rest = shuffle(pool.filter(w=>w.category!==q.category));
    const combined = sameCat.concat(rest);
    const seen = new Set([q.ja]);
    const result = [];
    for(const w of combined){
      if(seen.has(w.ja)) continue;
      seen.add(w.ja);
      result.push(w);
      if(result.length>=n) break;
    }
    return result;
  }

  function onTypingKeyDown(e){
    if(!state || state.mode !== "typing" || state.phase !== "play") return;
    if(e.key === "Escape"){ e.preventDefault(); skipCurrent(); return; }
    if(e.key.length !== 1) return;
    e.preventDefault();

    const q = currentQuestion();
    const expected = q.en[state.typedLen];
    const spans = lettersEl.children;

    if(e.key.toLowerCase() === expected.toLowerCase()){
      const span = spans[state.typedLen];
      span.textContent = expected === " " ? " " : expected;
      span.classList.remove("active");
      span.classList.add("correct");
      state.typedLen++;
      if(state.typedLen < q.en.length){
        spans[state.typedLen].classList.add("active");
      }else{
        state.qElapsedMs = performance.now() - state.qStartTime;
        enterReveal("ok");
      }
    }else{
      state.hadMistake = true;
      const span = spans[state.typedLen];
      span.classList.remove("error");
      void span.offsetWidth;
      span.classList.add("error");
      setTimeout(()=> span.classList.remove("error"), 240);
    }
  }

  function onChoiceClick(btn, opt, q){
    if(btn.disabled || state.phase !== "play") return;
    if(opt.id === q.id){
      btn.classList.add("correct");
      [...choicesEl.children].forEach(b=> b.disabled = true);
      state.qElapsedMs = performance.now() - state.qStartTime;
      enterReveal("ok");
    }else{
      state.hadMistake = true;
      btn.classList.remove("error");
      void btn.offsetWidth;
      btn.classList.add("error");
      btn.disabled = true;
    }
  }

  function skipCurrent(){
    if(!state || state.mode !== "typing" || state.phase !== "play") return;
    state.skipped = true;
    state.qElapsedMs = performance.now() - state.qStartTime;
    enterReveal("skip");
  }

  /* --- reveal panel --- */
  function setRevealBlock(blockEl, bodyEl, text){
    if(text){ bodyEl.textContent = text; blockEl.hidden = false; }
    else{ blockEl.hidden = true; }
  }
  function enterReveal(kind){
    const q = currentQuestion();
    state.phase = "reveal";
    state.revealAt = performance.now();
    document.removeEventListener("keydown", onTypingKeyDown);

    revealBadge.className = "reveal-badge " + (kind === "skip" ? "skip" : "ok");
    revealBadge.textContent = kind === "skip" ? "スキップ — 正解はこちら" : "正解!";
    revealWord.textContent = q.en;
    revealJa.textContent = q.ja;
    setRevealBlock(revealWhere, revealWhereBody, q.where);
    setRevealBlock(revealPhrase, revealPhraseBody, q.phrase);

    const xrefHtml = SEL.renderCrossRef(q, ENGINE_ID);
    if(xrefHtml){ revealXref.innerHTML = xrefHtml; revealXref.hidden = false; }
    else { revealXref.innerHTML = ""; revealXref.hidden = true; }

    revealCont.textContent = IS_TOUCH ? "タップで次へ" : "任意のキーで次へ";

    typingArea.hidden = true;
    choiceArea.hidden = true;
    revealArea.hidden = false;

    document.addEventListener("keydown", onRevealKey);
    revealArea.addEventListener("click", onRevealClick);
  }
  function onRevealKey(e){
    if(!state || state.phase !== "reveal") return;
    if(performance.now() - state.revealAt < 120) return;
    e.preventDefault();
    dismissReveal();
  }
  function onRevealClick(){
    if(!state || state.phase !== "reveal") return;
    if(performance.now() - state.revealAt < 120) return;
    dismissReveal();
  }
  function dismissReveal(){
    document.removeEventListener("keydown", onRevealKey);
    revealArea.removeEventListener("click", onRevealClick);
    revealArea.hidden = true;
    state.phase = "play";
    finishQuestion();
  }

  function finishQuestion(){
    const q = currentQuestion();
    const outcome = state.skipped ? "skip" : (state.hadMistake ? "miss" : "clean");
    state.results.push({
      id: q.id, en: q.en, ja: q.ja,
      hadMistake: state.hadMistake,
      skipped: state.skipped,
      chars: q.en.length,
      elapsedMs: state.qElapsedMs || 0,
    });
    markProgress(q, { seen: true });
    const graduated = recordResult(q, outcome);
    if(graduated) markProgress(q, { graduated: true });
    state.index++;
    if(state.index >= state.questions.length){
      endGame();
    }else{
      updateProgressUI();
      renderQuestion();
    }
  }

  function quitGame(){
    if(!confirm("このセットを中断して設定画面に戻ります。よろしいですか?")) return;
    teardownGameListeners();
    state = null;
    showScreen("setup");
    updatePoolPreview();
  }

  function endGame(){
    teardownGameListeners();
    const elapsedSec = (performance.now() - state.startTime) / 1000;
    const results = state.results;
    const total = results.length;

    const skippedResults = results.filter(r=> r.skipped);
    const mistakeResults = results.filter(r=> !r.skipped && r.hadMistake);
    const cleanResults   = results.filter(r=> !r.skipped && !r.hadMistake);

    const skippedCount = skippedResults.length;
    const mistakeCount = mistakeResults.length;
    const cleanCount   = cleanResults.length;

    const correctCount = cleanCount + mistakeCount;
    const accuracy = total > 0 ? Math.round((correctCount / total) * 1000) / 10 : 0;

    const typed = results.filter(r=> !r.skipped);
    const wpmChars = typed.reduce((s,r)=> s + r.chars, 0);
    const wpmMs = typed.reduce((s,r)=> s + r.elapsedMs, 0);
    const wpm = (typed.length > 0 && wpmMs > 0)
      ? Math.round((wpmChars / 5) / (wpmMs / 60000))
      : null;

    const review = results.filter(r=> r.skipped || r.hadMistake);

    resultAccuracy.textContent = accuracy + "%";
    resultCorrect.textContent = `${cleanCount} / ${total}`;
    resultWpm.textContent = (wpm === null) ? "-" : wpm;
    resultWpmLabel.textContent = (wpm === null) ? "" : (state.mode === "typing" ? "" : "(換算)");
    resultMissed.textContent = mistakeCount;
    resultSkipped.textContent = skippedCount;
    resultTime.textContent = formatTime(elapsedSec);

    if(review.length===0){
      missedList.innerHTML = "";
      missedList.hidden = true;
      const empty = document.createElement("div");
      empty.className = "missed-empty";
      empty.textContent = "ミス・スキップなし!パーフェクトです 🎉";
      missedList.parentNode.insertBefore(empty, missedList.nextSibling);
      missedList._emptyEl = empty;
    }else{
      if(missedList._emptyEl){ missedList._emptyEl.remove(); missedList._emptyEl = null; }
      missedList.hidden = false;
      missedList.innerHTML = review.map(r=>{
        const w = ALL_WORDS.find(x=> x.id === r.id) || r;
        const extra = [
          w.where  ? `<div class="mi-x"><span>どこで使う</span>${escapeHtml(w.where)}</div>`  : "",
          w.phrase ? `<div class="mi-x"><span>実際の表記</span>${escapeHtml(w.phrase)}</div>` : "",
        ].join("") + SEL.renderCrossRef(w, ENGINE_ID);
        return `<div class="missed-item">
          <div class="missed-item-head">
            <span class="en">${escapeHtml(r.en)}</span>
            <span class="ja">${escapeHtml(r.ja)}${r.skipped ? ' <span class="skip-tag">スキップ</span>' : ""}</span>
          </div>${extra}
        </div>`;
      }).join("");
    }

    const weakTotal = myWeakKeys(loadWeak()).length;
    weakTotalInfo.innerHTML = `現在の苦手リスト: <b>${weakTotal}</b>語(次回のセットで優先的に出題されます)`;

    showScreen("result");
  }

  /* ---------- weak words screen ---------- */
  function renderWeakBook(){
    const weak = loadWeak();
    const byKey = new Map(ALL_WORDS.map(w=>[weakIdFor(w), w]));
    const rows = myWeakKeys(weak)
      .map(key=>({ word: byKey.get(key), entry: normalizeEntry(weak[key]) }))
      .filter(r=> r.word)
      .map(r=>({ word: r.word, miss: r.entry.miss, skip: r.entry.skip, clean: r.entry.clean }))
      .sort((a,b)=> b.miss - a.miss || b.skip - a.skip || a.word.en.localeCompare(b.word.en));

    if(rows.length === 0){
      weakListEl.innerHTML = "";
      weakListEl.hidden = true;
      weakEmptyEl.hidden = false;
      return;
    }
    weakListEl.hidden = false;
    weakEmptyEl.hidden = true;
    weakListEl.innerHTML = rows.map(r=>{
      const w = r.word;
      return `
        <div class="weak-row">
          <div class="weak-row-main">
            <span class="en">${escapeHtml(w.en)}</span>
            <span class="ja">${escapeHtml(w.ja)}</span>
            <span class="weak-counts">
              <span class="miss">ミス <b>${r.miss}</b></span>
              <span class="skip">スキップ <b>${r.skip}</b></span>
              <span class="clean">ノーミス <b>${r.clean}</b>/${CONFIG.graduateCleanStreak}</span>
            </span>
          </div>
          <div class="weak-chips">
            <span class="tag">${escapeHtml(w.category)}</span>
            <span class="tag">Lv${escapeHtml(String(w.level))}</span>
            <span class="tag grad">卒業まであと ${Math.max(0, CONFIG.graduateCleanStreak - r.clean)} 回</span>
          </div>
          <div class="weak-detail">${SEL.renderExpandBody(w, ENGINE_ID)}</div>
        </div>`;
    }).join("");
  }
  weakListEl.addEventListener("click", e=>{
    const row = e.target.closest(".weak-row");
    if(row) row.classList.toggle("open");
  });

  /* ---------- word list (dictionary) screen ---------- */
  const searchHay = new Map();
  let dictFiltersBuilt = false;

  function buildSearchIndex(){
    ALL_WORDS.forEach(w=>{
      const parts = ["en","ja","note","where","phrase"].map(k=> w[k] || "");
      const xrefEns = SEL.crossRefEnsFor(w, ENGINE_ID); // 対応する他エンジンの英語表記も検索対象に
      searchHay.set(w.id, parts.concat(xrefEns).join(" ␟ ").toLowerCase());
    });
  }
  function buildDictFilters(){
    const cats = [...new Set(ALL_WORDS.map(w=>w.category))];
    const lvls = [...new Set(ALL_WORDS.map(w=>w.level))].sort((a,b)=>a-b);
    dictCatEl.innerHTML = cats.map(c=>
      `<label class="chip"><input type="checkbox" class="dict-cat-check" value="${escapeHtml(c)}" checked>${escapeHtml(c)}</label>`
    ).join("");
    dictLvlEl.innerHTML = lvls.map(l=>
      `<label class="chip"><input type="checkbox" class="dict-lvl-check" value="${l}" checked>Lv${l}</label>`
    ).join("");
    dictStatusEl.innerHTML = Object.keys(WORD_STATUS).map(k=>
      `<label class="chip"><input type="checkbox" class="dict-status-check" value="${k}" checked>${WORD_STATUS[k].label}</label>`
    ).join("");
    dictCatEl.addEventListener("change", renderDictionary);
    dictLvlEl.addEventListener("change", renderDictionary);
    dictStatusEl.addEventListener("change", renderDictionary);
    dictSearchEl.addEventListener("input", renderDictionary);
    dictFiltersBuilt = true;
  }
  function checkedValues(container, cls){
    return [...container.querySelectorAll("input." + cls + ":checked")].map(i=>i.value);
  }
  function updateDictProgress(){
    const weak = loadWeak();
    const progress = loadProgress();
    const c = { unseen:0, learning:0, graduated:0, cleared:0 };
    ALL_WORDS.forEach(w=>{ c[wordStatus(w, weak, progress).key]++; });
    dictProgressEl.innerHTML =
      `全 <b>${ALL_WORDS.length}</b> 語　` +
      `未出題 <b>${c.unseen}</b>　学習中 <b>${c.learning}</b>　` +
      `卒業 <b>${c.graduated}</b>　正解済み <b>${c.cleared}</b>`;
  }
  function renderDictionary(){
    const weak = loadWeak();
    const progress = loadProgress();
    const cats = checkedValues(dictCatEl, "dict-cat-check");
    const lvls = checkedValues(dictLvlEl, "dict-lvl-check").map(Number);
    const stats = checkedValues(dictStatusEl, "dict-status-check");
    const q = dictSearchEl.value.trim().toLowerCase();

    const rows = ALL_WORDS
      .filter(w=>{
        if(!cats.includes(w.category)) return false;
        if(!lvls.includes(w.level)) return false;
        if(!stats.includes(wordStatus(w, weak, progress).key)) return false;
        if(q && !(searchHay.get(w.id) || "").includes(q)) return false;
        return true;
      })
      .sort((a,b)=> a.en.toLowerCase().localeCompare(b.en.toLowerCase()));

    dictCountEl.textContent = `${rows.length} 件` + (q ? ` (「${dictSearchEl.value.trim()}」で検索)` : "");

    if(rows.length === 0){
      dictListEl.innerHTML = "";
      dictListEl.hidden = true;
      dictEmptyEl.hidden = false;
      return;
    }
    dictListEl.hidden = false;
    dictEmptyEl.hidden = true;
    dictListEl.innerHTML = rows.map(w=>{
      const st = wordStatus(w, weak, progress);
      return `
        <div class="weak-row">
          <div class="weak-row-main">
            <span class="en">${escapeHtml(w.en)}</span>
            <span class="ja">${escapeHtml(w.ja)}</span>
            <span class="status-badge ${st.cls}">${escapeHtml(st.label)}</span>
          </div>
          <div class="weak-chips">
            <span class="tag">${escapeHtml(w.category)}</span>
            <span class="tag">Lv${escapeHtml(String(w.level))}</span>
          </div>
          <div class="weak-detail">${SEL.renderExpandBody(w, ENGINE_ID)}</div>
        </div>`;
    }).join("");
  }
  function openDictionary(){
    if(!dictFiltersBuilt) buildDictFilters();
    updateDictProgress();
    renderDictionary();
    showScreen("dict");
  }
  dictListEl.addEventListener("click", e=>{
    const row = e.target.closest(".weak-row");
    if(row) row.classList.toggle("open");
  });

  /* ---------- header nav / app info ---------- */
  function buildPageNav(){
    const nav = document.getElementById("page-nav");
    if(!nav) return;
    const parts = [`<a href="/">SEL トップ</a>`];
    SEL.publicEngines().forEach(e=>{
      if(e.id === ENGINE_ID) parts.push(`<a class="current" href="${e.path}">${escapeHtml(e.name)} 編</a>`);
      else parts.push(`<a href="${e.path}">${escapeHtml(e.name)} 編へ</a>`);
    });
    nav.innerHTML = parts.join(`<span class="sep">/</span>`);
  }
  function applyAppInfo(){
    SEL.applyPageMeta(SEL_PAGE.meta);
    const ui = SEL_PAGE.ui || {};
    const set = (id, txt)=>{ const el = document.getElementById(id); if(el) el.textContent = txt; };
    set("app-title", ui.h1 || "");
    set("app-subtitle", ui.subtitle || "");
    set("footer-text", ui.footer || "");
    const repo = document.getElementById("footer-repo");
    if(repo && ui.repoUrl) repo.href = ui.repoUrl;
    buildPageNav();
  }
  function applyTouchDefaults(){
    if(!IS_TOUCH) return;
    const choiceRadio = document.querySelector('input[name="mode"][value="choice"]');
    if(choiceRadio) choiceRadio.checked = true;
    const note = document.getElementById("mode-note");
    if(note) note.hidden = false;
  }

  /* ---------- wire up ---------- */
  startBtn.addEventListener("click", startGame);
  resetWeakBtn.addEventListener("click", resetWeakList);
  quitBtn.addEventListener("click", quitGame);
  backBtn.addEventListener("click", ()=>{ showScreen("setup"); updatePoolPreview(); });
  retryBtn.addEventListener("click", startGame);
  weakBookBtn.addEventListener("click", ()=>{ renderWeakBook(); showScreen("weak"); });
  weakBackBtn.addEventListener("click", ()=>{ showScreen("setup"); updatePoolPreview(); });
  weakResetBtn.addEventListener("click", resetWeakList);
  dictBtn.addEventListener("click", openDictionary);
  dictBackBtn.addEventListener("click", ()=>{ showScreen("setup"); updatePoolPreview(); });

  /* ---------- load error ---------- */
  function showLoadError(url, err){
    appEl.innerHTML =
      `<div class="card load-error">
        <h2>単語データを読み込めませんでした</h2>
        <p><code>${escapeHtml(url)}</code> の取得に失敗しました。</p>
        <p>${escapeHtml(String((err && err.message) || err || ""))}</p>
        <p>ネットワークを確認して、ページを再読み込みしてください。</p>
        <p><a href="/">SEL トップへ戻る</a></p>
      </div>`;
  }

  /* ---------- init / boot ---------- */
  function init(){
    applyAppInfo();
    applyTouchDefaults();
    migrateWeak();
    buildFilterUI();
    buildSearchIndex();
    updatePoolPreview();
  }

  async function boot(){
    if(!ENGINE_ID || !engineDef.data){
      showLoadError("(設定エラー)", new Error("SEL_PAGE.engineId が未設定、または ENGINES 登録簿に見つかりません"));
      return;
    }
    let ownData;
    try{
      ownData = await SEL.loadWordData(engineDef.data);
    }catch(err){
      showLoadError(engineDef.data, err);
      return;
    }
    SEL.registerWords(ENGINE_ID, ownData.words);
    ALL_WORDS = ownData.words;

    // 他エンジンのデータ(相互参照用)。失敗しても本体は動かす。
    await Promise.allSettled(
      SEL.publicEngines()
        .filter(e=> e.id !== ENGINE_ID)
        .map(async e=>{
          try{
            const d = await SEL.loadWordData(e.data);
            SEL.registerWords(e.id, d.words);
          }catch(err){
            console.warn("相互参照データの読み込みに失敗:", e.id, err);
          }
        })
    );

    init();

    // テスト用フック(SEL_PAGE.debug が true のときだけ公開。本番ページでは無効)
    if(SEL_PAGE.debug){
      window.SEL_DEBUG = {
        get state(){ return state; },
        get ALL_WORDS(){ return ALL_WORDS; },
        loadWeak, loadProgress, wordStatus, ENGINE_ID,
      };
    }
  }

  boot();
})();
