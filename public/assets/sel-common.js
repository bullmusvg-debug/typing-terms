/* ============================================================
   Spell Engine Library — 共有コード (window.SEL)
   トップページ (hub.js) / 各エンジンページ (engine.js) 共通。
   ここに ENGINES 登録簿・データ読み込み・相互参照・メタ設定をまとめる。
   ============================================================ */
window.SEL = (function(){
  "use strict";

  /* ---------------------------------------------------------
   * エンジン登録簿
   *  新エンジンを追加する手順は README「新しいエンジンの追加」参照。
   *  - id     : 記録キーの接頭辞 / URL / データファイル名に使う短い識別子
   *  - name   : 表示名
   *  - path   : そのエンジンページの絶対パス
   *  - data   : 単語データJSONの絶対パス
   *  - status : "public"(公開中) | "coming"(準備中。ページ・データ未作成)
   * --------------------------------------------------------- */
  const ENGINES = [
    { id: "ue",    name: "Unreal Engine", short: "UE",    path: "/ue/",    data: "/data/words-ue.json",    status: "public" },
    { id: "unity", name: "Unity",         short: "Unity", path: "/unity/", data: "/data/words-unity.json", status: "public" },
    { id: "godot", name: "Godot",         short: "Godot", path: "/godot/", data: "/data/words-godot.json", status: "public" },
    { id: "verse", name: "Verse",         short: "Verse", path: "/verse/", data: "/data/words-verse.json", status: "coming" },
  ];
  function engineById(id){ return ENGINES.find(e=> e.id === id) || null; }
  function publicEngines(){ return ENGINES.filter(e=> e.status === "public"); }

  /* ---------------------------------------------------------
   * 調整用の設定値(全エンジン共通)
   * --------------------------------------------------------- */
  const CONFIG = {
    setSize: 10,             // 1セットの出題数
    graduateCleanStreak: 3,  // 連続ノーミス正解がこの回数に達したら苦手リストから卒業(削除)
    missCap: 5,              // miss カウントの上限
  };

  /* ---------------------------------------------------------
   * 単語の展開表示に出すフィールド。
   * ここに1行足すだけで 単語一覧 / 苦手単語帳 / トップ統合辞典 の
   * 展開部すべてに反映される。(「他エンジンでの呼び方」は concept/match
   * から別途生成しているので、この配列には入れない)
   * --------------------------------------------------------- */
  const DETAIL_FIELDS = [
    { key: "note",   label: "note" },
    { key: "where",  label: "where" },
    { key: "phrase", label: "phrase" },
  ];

  function escapeHtml(str){
    return String(str).replace(/[&<>"']/g, ch=>({
      "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
    }[ch]));
  }

  /* ---------- データ読み込み ---------- */
  async function loadWordData(url){
    const res = await fetch(url, { cache: "no-cache" });
    if(!res.ok) throw new Error(url + " → HTTP " + res.status);
    const json = await res.json();
    if(!json || !Array.isArray(json.words)) throw new Error(url + " → 想定した形式ではありません");
    return json; // { meta, words }
  }

  // 読み込んだ各エンジンの単語配列を保持(相互参照に使う)
  const _wordsByEngine = new Map();
  function registerWords(engineId, words){ _wordsByEngine.set(engineId, words); }
  function wordsFor(engineId){ return _wordsByEngine.get(engineId) || []; }
  function loadedEngineIds(){ return [..._wordsByEngine.keys()]; }
  function allLoadedWords(){
    // 登録簿の順序で連結。各語に _engineId / _engineName を付与したコピーを返す
    const out = [];
    for(const eng of ENGINES){
      const list = _wordsByEngine.get(eng.id);
      if(!list) continue;
      for(const w of list) out.push(Object.assign({ _engineId: eng.id, _engineName: eng.name }, w));
    }
    return out;
  }

  /* ---------- エンジン間の相互参照 (concept / match) ---------- */
  // myEngineId の word に対応する、他エンジンの語を返す
  function crossRefsFor(word, myEngineId){
    if(!word || !word.concept) return [];
    const out = [];
    for(const eng of ENGINES){
      if(eng.id === myEngineId) continue;
      const list = _wordsByEngine.get(eng.id);
      if(!list) continue;
      for(const w of list){
        if(w.concept && w.concept === word.concept){
          out.push({ engineId: eng.id, engineName: eng.name, en: w.en, ja: w.ja, match: w.match || "同義" });
        }
      }
    }
    return out;
  }
  // 検索インデックス用: 対応する他エンジンの英語表記の配列
  function crossRefEnsFor(word, myEngineId){
    return crossRefsFor(word, myEngineId).map(r=> r.en);
  }

  function matchBadge(match){
    return (match === "近い")
      ? `<span class="xref-tag near">近い</span><span class="xref-note">完全に同じではない</span>`
      : `<span class="xref-tag syn">同義</span>`;
  }

  /* ---------- 展開表示の中身 ---------- */
  function renderDetailRows(w){
    const rows = DETAIL_FIELDS
      .filter(f=> w[f.key])
      .map(f=> `<div><b>${escapeHtml(f.label)}</b>${escapeHtml(String(w[f.key]))}</div>`);
    return rows.length ? rows.join("") : `<div>詳細情報はありません。</div>`;
  }
  function renderCrossRef(word, myEngineId){
    const refs = crossRefsFor(word, myEngineId);
    if(refs.length === 0) return "";
    const items = refs.map(r=>
      `<div class="xref-item">${escapeHtml(r.engineName)} では <b>${escapeHtml(r.en)}</b>（${escapeHtml(r.ja)}）${matchBadge(r.match)}</div>`
    ).join("");
    return `<div class="xref-wrap"><div class="xref-h">他エンジンでの呼び方</div>${items}</div>`;
  }
  // 展開部の完全な中身(詳細フィールド + 他エンジンでの呼び方)
  function renderExpandBody(word, myEngineId){
    return renderDetailRows(word) + renderCrossRef(word, myEngineId);
  }

  /* ---------- ページのメタ情報 (title / description / OGP / canonical) ---------- */
  function setMeta(attr, key, value){
    let el = document.head.querySelector('meta[' + attr + '="' + key + '"]');
    if(!el){ el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
    el.setAttribute("content", value);
  }
  function applyPageMeta(m){
    if(!m) return;
    if(m.title) document.title = m.title;
    if(m.description) setMeta("name", "description", m.description);
    setMeta("property", "og:type", "website");
    if(m.siteName) setMeta("property", "og:site_name", m.siteName);
    if(m.title) setMeta("property", "og:title", m.title);
    if(m.description) setMeta("property", "og:description", m.description);
    if(m.url) setMeta("property", "og:url", m.url);
    if(m.image) setMeta("property", "og:image", m.image);
    setMeta("name", "twitter:card", "summary_large_image");
    if(m.title) setMeta("name", "twitter:title", m.title);
    if(m.description) setMeta("name", "twitter:description", m.description);
    if(m.image) setMeta("name", "twitter:image", m.image);
    if(m.url){
      let canon = document.head.querySelector('link[rel="canonical"]');
      if(!canon){ canon = document.createElement("link"); canon.setAttribute("rel","canonical"); document.head.appendChild(canon); }
      canon.setAttribute("href", m.url);
    }
  }

  return {
    ENGINES, engineById, publicEngines,
    CONFIG, DETAIL_FIELDS,
    escapeHtml,
    loadWordData, registerWords, wordsFor, loadedEngineIds, allLoadedWords,
    crossRefsFor, crossRefEnsFor, matchBadge,
    renderDetailRows, renderCrossRef, renderExpandBody,
    applyPageMeta,
  };
})();
