/* ============================================================
   Spell Engine Library — トップページ (/)
   ・各エンジン版へのカードリンク
   ・全エンジン横断の統合辞典(調べる用途に特化。学習機能なし)
   localStorage には一切触れない。
   ============================================================ */
(function(){
  "use strict";

  const SEL = window.SEL;
  const { escapeHtml, ENGINES } = SEL;
  const PAGE = window.SEL_PAGE || {};

  const HUB_HTML = `
  <header>
    <nav class="page-nav" id="page-nav"></nav>
    <h1>⌨ Spell Engine Library</h1>
    <p>ゲームエンジン開発の英単語を、意味・使用場面とセットで覚える</p>
  </header>

  <section class="card">
    <p class="hub-intro">
      <b>Spell Engine Library (SEL)</b> は、ゲームエンジン開発でよく使う英単語を、
      日本語の意味・エディタ上での使用場面・実際のノード名や API 名とセットで覚えるための学習ツールです。
      タイピング / 4択で出題し、間違えた語は苦手リストにためて繰り返し出題します。
    </p>
    <div class="hub-feature">
      <b>エンジンをまたいで対応する用語を相互参照できます。</b>
      たとえば Unreal Engine の <b>Level</b> と Unity の <b>Scene</b>、
      UE の <b>Location</b> と Unity の <b>Position</b> は同じ概念です。
      片方のエンジンを知っていれば、もう片方の用語も対応づけて学べます。
    </div>
    <div class="engine-cards" id="engine-cards"></div>
  </section>

  <section class="card" id="hub-dict-section">
    <h2 style="font-size:1.1rem;margin:0 0 6px;">📖 統合辞典</h2>
    <p class="dict-progress" id="hub-lead"></p>
    <input type="search" id="hub-search" class="dict-search" autocomplete="off"
           placeholder="検索: 英語・日本語・解説・ノード名 / API名・他エンジンでの呼び方">
    <div class="dict-filters">
      <div class="chip-group" id="hub-eng"></div>
      <div class="chip-group" id="hub-cat"></div>
      <div class="chip-group" id="hub-lvl"></div>
    </div>
    <label class="hub-dict-toggle">
      <input type="checkbox" id="hub-pairs">
      対応語のみ表示（エンジン間で対応する語を対で並べる）
    </label>
    <div class="dict-count" id="hub-count"></div>
    <div class="weak-list" id="hub-list"></div>
    <div class="weak-empty" id="hub-empty" hidden>該当する単語がありません。</div>
  </section>

  <footer id="app-footer">
    <p id="footer-text"></p>
    <p>アクセス解析に Cloudflare Web Analytics を使用しています(個人を追跡しません)</p>
    <p><a id="footer-repo" target="_blank" rel="noopener noreferrer">GitHub リポジトリ</a></p>
  </footer>`;

  const appEl = document.getElementById("app");

  let ALL = [];            // 全エンジンの単語(SEL.allLoadedWords)
  let hay = new Map();      // key: _engineId+":"+id -> 検索テキスト
  let els = {};

  function wkey(w){ return w._engineId + ":" + w.id; }

  function buildSearchIndex(){
    hay = new Map();
    ALL.forEach(w=>{
      const parts = ["en","ja","note","where","phrase"].map(k=> w[k] || "");
      const xrefEns = SEL.crossRefEnsFor(w, w._engineId);
      hay.set(wkey(w), parts.concat(xrefEns).join(" ␟ ").toLowerCase());
    });
  }

  function buildPageNav(){
    const parts = [`<a class="current" href="/">SEL トップ</a>`];
    SEL.publicEngines().forEach(e=> parts.push(`<a href="${e.path}">${escapeHtml(e.name)} 編</a>`));
    els.nav.innerHTML = parts.join(`<span class="sep">/</span>`);
  }

  function renderEngineCards(){
    els.cards.innerHTML = ENGINES.map(e=>{
      if(e.status === "public"){
        const n = SEL.wordsFor(e.id).length;
        const meta = n > 0 ? `収録 ${n} 語 / 公開中` : `公開中`;
        return `<a class="engine-card" href="${e.path}">
          <div class="ec-name">${escapeHtml(e.name)} 編</div>
          <div class="ec-meta">${meta}</div>
          <div class="ec-badge">公開中</div>
        </a>`;
      }
      return `<div class="engine-card coming" aria-disabled="true">
        <div class="ec-name">${escapeHtml(e.name)} 編</div>
        <div class="ec-meta">準備中</div>
        <div class="ec-badge">準備中</div>
      </div>`;
    }).join("");
  }

  function buildFilters(){
    const engIds = SEL.loadedEngineIds();
    els.eng.innerHTML = engIds.map(id=>{
      const e = SEL.engineById(id);
      return `<label class="chip"><input type="checkbox" class="hub-eng-check" value="${escapeHtml(id)}" checked>${escapeHtml(e ? e.name : id)}</label>`;
    }).join("");
    const cats = [...new Set(ALL.map(w=>w.category))];
    els.cat.innerHTML = cats.map(c=>
      `<label class="chip"><input type="checkbox" class="hub-cat-check" value="${escapeHtml(c)}" checked>${escapeHtml(c)}</label>`
    ).join("");
    const lvls = [...new Set(ALL.map(w=>w.level))].sort((a,b)=>a-b);
    els.lvl.innerHTML = lvls.map(l=>
      `<label class="chip"><input type="checkbox" class="hub-lvl-check" value="${l}" checked>Lv${l}</label>`
    ).join("");

    [els.eng, els.cat, els.lvl].forEach(c=> c.addEventListener("change", render));
    els.search.addEventListener("input", render);
    els.pairs.addEventListener("change", render);
  }

  function checked(container, cls){
    return [...container.querySelectorAll("input." + cls + ":checked")].map(i=>i.value);
  }

  function passes(w, engSet, catSet, lvlSet, q){
    if(!engSet.has(w._engineId)) return false;
    if(!catSet.has(w.category)) return false;
    if(!lvlSet.has(w.level)) return false;
    if(q && !(hay.get(wkey(w)) || "").includes(q)) return false;
    return true;
  }

  function wordRow(w){
    return `
      <div class="weak-row">
        <div class="weak-row-main">
          <span class="en">${escapeHtml(w.en)}</span>
          <span class="ja">${escapeHtml(w.ja)}</span>
        </div>
        <div class="weak-chips">
          <span class="tag eng">${escapeHtml(w._engineName)}</span>
          <span class="tag">${escapeHtml(w.category)}</span>
          <span class="tag">Lv${escapeHtml(String(w.level))}</span>
        </div>
        <div class="weak-detail">${SEL.renderExpandBody(w, w._engineId)}</div>
      </div>`;
  }

  // concept -> 全エンジン横断で 2 エンジン以上に語がある概念グループ
  function conceptGroups(){
    const byConcept = new Map();
    ALL.forEach(w=>{
      if(!w.concept) return;
      if(!byConcept.has(w.concept)) byConcept.set(w.concept, []);
      byConcept.get(w.concept).push(w);
    });
    return [...byConcept.entries()]
      .filter(([, ws]) => new Set(ws.map(w=>w._engineId)).size >= 2)
      .map(([concept, ws]) => ({ concept, words: ws }));
  }

  function groupRelation(ws){
    return ws.some(w=> w.match === "近い") ? "近い" : "同義";
  }

  function render(){
    const engSet = new Set(checked(els.eng, "hub-eng-check"));
    const catSet = new Set(checked(els.cat, "hub-cat-check"));
    const lvlSet = new Set(checked(els.lvl, "hub-lvl-check").map(Number));
    const q = els.search.value.trim().toLowerCase();
    const qLabel = els.search.value.trim();
    const pairsMode = els.pairs.checked;

    if(pairsMode){
      const groups = conceptGroups()
        .filter(g => g.words.some(w=> passes(w, engSet, catSet, lvlSet, q)))
        .sort((a,b)=> a.words[0].en.toLowerCase().localeCompare(b.words[0].en.toLowerCase()));
      els.count.textContent = `${groups.length} 組` + (q ? ` (「${qLabel}」で検索)` : "");
      if(groups.length === 0){ showEmpty(); return; }
      els.list.hidden = false; els.empty.hidden = true;
      els.list.innerHTML = groups.map(g=>{
        const rel = groupRelation(g.words);
        const relCls = rel === "近い" ? "near" : "syn";
        const rows = g.words
          .slice()
          .sort((a,b)=> ENGINES.findIndex(e=>e.id===a._engineId) - ENGINES.findIndex(e=>e.id===b._engineId))
          .map(wordRow).join("");
        return `<div class="xref-group">
          <div class="xref-group-head">
            <span class="xref-tag ${relCls}">${rel}</span>
            ${rel === "近い" ? `<span class="xref-group-rel">値の向きや範囲が異なることがある</span>` : ""}
          </div>
          ${rows}
        </div>`;
      }).join("");
      return;
    }

    const rows = ALL
      .filter(w=> passes(w, engSet, catSet, lvlSet, q))
      .sort((a,b)=> a.en.toLowerCase().localeCompare(b.en.toLowerCase()));
    els.count.textContent = `${rows.length} 件` + (q ? ` (「${qLabel}」で検索)` : "");
    if(rows.length === 0){ showEmpty(); return; }
    els.list.hidden = false; els.empty.hidden = true;
    els.list.innerHTML = rows.map(wordRow).join("");
  }
  function showEmpty(){
    els.list.innerHTML = ""; els.list.hidden = true; els.empty.hidden = false;
  }

  function showLoadError(msg){
    appEl.innerHTML = `<div class="card load-error">
      <h2>データを読み込めませんでした</h2>
      <p>${escapeHtml(msg)}</p>
      <p>ネットワークを確認して、ページを再読み込みしてください。</p>
    </div>`;
  }

  async function boot(){
    SEL.applyPageMeta(PAGE.meta);

    const pubs = SEL.publicEngines();
    const results = await Promise.allSettled(pubs.map(async e=>{
      const d = await SEL.loadWordData(e.data);
      SEL.registerWords(e.id, d.words);
      return e.id;
    }));
    const okCount = results.filter(r=> r.status === "fulfilled").length;
    if(okCount === 0){
      showLoadError("すべてのエンジンの単語データの取得に失敗しました。");
      return;
    }

    appEl.innerHTML = HUB_HTML;
    els = {
      nav: document.getElementById("page-nav"),
      cards: document.getElementById("engine-cards"),
      lead: document.getElementById("hub-lead"),
      search: document.getElementById("hub-search"),
      eng: document.getElementById("hub-eng"),
      cat: document.getElementById("hub-cat"),
      lvl: document.getElementById("hub-lvl"),
      pairs: document.getElementById("hub-pairs"),
      count: document.getElementById("hub-count"),
      list: document.getElementById("hub-list"),
      empty: document.getElementById("hub-empty"),
    };

    ALL = SEL.allLoadedWords();
    buildSearchIndex();

    const pairCount = conceptGroups().length;
    els.lead.innerHTML =
      `全 <b>${ALL.length}</b> 語（` +
      SEL.loadedEngineIds().map(id=>{
        const e = SEL.engineById(id);
        return `${escapeHtml(e ? e.name : id)} <b>${SEL.wordsFor(id).length}</b>`;
      }).join(" / ") +
      `）　対応語 <b>${pairCount}</b> 組　※学習機能はありません。調べる用途に特化しています。`;

    if(results.some(r=> r.status === "rejected")){
      els.lead.innerHTML += `<br><span class="warn" style="color:var(--warn)">一部のエンジンのデータを読み込めませんでした。</span>`;
    }

    buildPageNav();
    renderEngineCards();
    buildFilters();
    render();

    const ui = PAGE.ui || {};
    const ft = document.getElementById("footer-text");
    const fr = document.getElementById("footer-repo");
    if(ft) ft.textContent = ui.footer || "";
    if(fr && ui.repoUrl) fr.href = ui.repoUrl;

    els.list.addEventListener("click", e=>{
      const row = e.target.closest(".weak-row");
      if(row) row.classList.toggle("open");
    });

    if(PAGE.debug){
      window.SEL_DEBUG = { get ALL(){ return ALL; }, conceptGroups, render, els };
    }
  }

  boot();
})();
