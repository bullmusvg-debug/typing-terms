# Spell Engine Library (SEL)

ゲームエンジン開発でよく使う英単語を、**意味・エディタ上での使用場面・実際のノード名 / API 名**とセットで覚えるためのブラウザ用学習ツールです。

**▶ [https://typing-terms.bullmus-vg.workers.dev/](https://typing-terms.bullmus-vg.workers.dev/)**

- タイピング / 4択で出題し、間違えた語は苦手リストにためて繰り返し出題（卒業ロジックあり）
- **エンジンをまたいで対応する用語を相互参照できる**のが特徴（UE の `Level` ⇔ Unity の `Scene` など、現在 120 組）
- 収録: Unreal Engine 編 160 語 / Unity 編 154 語（合計 314 語）。Godot 編・Verse 編は準備中

---

## URL 構成

| URL | 内容 |
| --- | --- |
| `/` | SEL トップ。各エンジン版へのリンク＋**全エンジン横断の統合辞典**（調べる用途に特化、学習機能なし） |
| `/ue/` | Unreal Engine 編（学習アプリ） |
| `/unity/` | Unity 編（学習アプリ） |
| `/data/words-ue.json` | UE 版データ |
| `/data/words-unity.json` | Unity 版データ |

`/ue` のように末尾スラッシュ無しでアクセスすると `/ue/` にリダイレクトされます（`wrangler.jsonc` の `html_handling`）。未知パスは 404 です。

---

## ディレクトリ構成

```
/
├─ public/                Cloudflare Workers の配信対象 (assets.directory)
│  ├─ index.html          SEL トップ (薄いページ。SEL_PAGE 設定 + hub.js)
│  ├─ ue/index.html       Unreal Engine 編 (薄いページ。SEL_PAGE 設定 + engine.js)
│  ├─ unity/index.html    Unity 編
│  ├─ assets/
│  │  ├─ sel.css          全ページ共通スタイル
│  │  ├─ sel-common.js    共通コード (window.SEL): ENGINES 登録簿 / データ読込 / 相互参照 / メタ設定
│  │  ├─ engine.js        学習アプリ本体 (エンジンページで読む)
│  │  └─ hub.js           トップページの統合辞典 (トップで読む)
│  ├─ data/
│  │  ├─ words-ue.json    UE 版データ (編集はここを直接)
│  │  └─ words-unity.json Unity 版データ
│  ├─ favicon.svg / favicon.ico / apple-touch-icon.png
│  └─ .assetsignore       配信から除外するファイル
└─ wrangler.jsonc         Cloudflare Workers 静的アセット配信設定
```

> `public/` を配信ディレクトリにしているのは、`wrangler dev` の監視対象から
> 生成物 (`.wrangler/`) や `node_modules/`・`README.md` を隔離するためです。
> リポジトリ直下を `assets.directory` にすると、`.wrangler/` への書き込みで
> リロードが自己誘発され `wrangler dev` が無限ループします。

各エンジンページは **HTML 側にロジックを持たず**、`window.SEL_PAGE` で設定を渡して `/assets/engine.js` を読み込むだけです。新エンジンの追加が薄いページ 1 枚＋データ＋登録簿 1 行で済みます（後述）。

---

## データの持ち方

学習アプリで他エンジンの語を引く必要があるため、単語データは外部 JSON です。

- 各ページは **自分のエンジンのデータ**（必須）と、**他の公開エンジンのデータ**（相互参照用・任意）を `fetch` で読み込みます
- 自分のデータの読み込みに失敗したら、その旨のエラー画面を表示します
- 他エンジンのデータの読み込みに失敗しても、相互参照が出なくなるだけで本体は動きます
- `file://` では `fetch` が使えないため動きません。ローカル確認は `npx wrangler dev`（または任意の静的サーバー）を使ってください

---

## 各エンジンページの機能

`/ue/` `/unity/` で共通に動きます（`assets/engine.js`）。

- **モード**: タイピング（意味 → 英単語を打つ）/ 4択（英単語 → 意味を選ぶ）。1セット10問
- **ミスタイプ制御**: 正しいキーを打つまで進ませない。4択も正解を選ぶまで進まない
- **スキップ**: タイピング中に <kbd>Esc</kbd>。正解の綴りを表示してから次へ。skip は不正解扱い、WPM から除外
- **正解 / スキップ直後の表示**: `where`（どこで使う）/ `phrase`（実際の表記）/ **他エンジンでの呼び方**。任意のキー（タッチはタップ）で次へ
- **結果**: 主指標＝正答率・ノーミス数、副指標（小）＝WPM・所要時間・スキップ・ミスあり。間違えた/スキップした単語一覧
- **苦手リスト**: ミス / スキップした語を記録し優先出題。連続ノーミス正解 `CONFIG.graduateCleanStreak`（=3）回で卒業（削除）
- **苦手単語帳**: 苦手語の一覧。行クリックで `note` / `where` / `phrase` / 他エンジンでの呼び方を展開
- **単語一覧（辞書）**: 収録全語の閲覧。横断検索・カテゴリ/レベル/学習状況フィルタ・進捗表示
- **カテゴリのチップはそのページのデータから動的生成**（UE は「UE固有 / 共通」、Unity は「Unity固有 / 共通」）
- ヘッダーに **SEL トップへのリンク**と**他エンジン版への切り替えリンク**

### 記録の分離（エンジン間で混ざらない）

localStorage は全エンジンで同じキーを使い、**中身のキーを `ue:` / `unity:` で前置**して分離します。各ページは自分の接頭辞の分だけを読み書き・集計します。

| キー | 内容 |
| --- | --- |
| `sel_weakWords_v1` | 苦手リスト。`{ "ue:89": { miss, skip, clean }, "unity:1001": {…} }` |
| `sel_wordProgress_v1` | 学習履歴。`{ "ue:89": { seen: true, graduated: true } }`（フラグ無し＝未設定） |
| `ueTypingTerms_weakWords_v1` | UE 旧ツールのキー。UE 版のみ起動時に新形式へ移行して削除 |

「苦手リストをリセット」は**そのエンジンの分だけ**消去します（`sel_wordProgress_v1` の学習履歴は残します）。

---

## エンジン間の相互参照

単語データの 2 フィールドで表現します。

| フィールド | 内容 |
| --- | --- |
| `concept` | エンジン横断の概念キー。同じ値を持つ語どうしが対応する（例: UE `Level` と Unity `Scene` が共に `"scene"`）。対応物が無い語には付けない |
| `match` | その対応の強さ。`"同義"` または `"近い"` |

- `concept` が一致する他エンジンの語を引いて「他エンジンでの呼び方」欄に表示（**苦手単語帳・単語一覧の展開表示、ゲーム中の正解/スキップ後、結果画面の一覧**）
- `"同義"` は緑バッジ、`"近い"` は黄バッジ＋「完全に同じではない」の注記で見た目を分ける（例: `Roughness` と `Smoothness` は値の向きが逆なので「同義」として覚えると誤る）
- `concept` が複数エンジンに対応する場合は全て表示
- **単語一覧の横断検索は、対応する他エンジンの英語表記も対象**（UE 版で「Scene」と検索すると `Level` がヒットする）

---

## トップページの統合辞典

`/` に、全エンジンの単語を横断して引ける辞典があります（`assets/hub.js`）。

- **学習記録（localStorage）には一切触れません。** 読み取りもしません
- 全エンジンの単語を 1 リストに統合表示（現在 314 語）。各行に 英単語 / 意味 / エンジンのチップ / カテゴリ・レベルのチップ
- 行クリックで `note` / `where` / `phrase` / 他エンジンでの呼び方を展開（`DETAIL_FIELDS` を各ページと共用）
- 横断検索の対象: `en` / `ja` / `note` / `where` / `phrase` ＋ 対応する他エンジンの英語表記
- 絞り込み: エンジン / カテゴリ / レベル
- **「対応語のみ表示」**: オンにすると `concept` で対応が付いている語だけに絞り、UE の語と Unity の語を対（グループ）で表示。現在 120 組
- Godot 編・Verse 編を公開すると、`ENGINES` 登録簿の `status` を `public` にするだけで自動的にこの辞典に含まれます

---

## 単語データの追加・編集

`data/words-ue.json` / `data/words-unity.json` を直接編集します（`{ "meta": {...}, "words": [ ... ] }` 形式）。

```json
{
  "id": 161,
  "en": "Overlap",
  "ja": "重なり / すり抜けつつ検知",
  "note": "ぶつからずに通過しつつ、重なりだけ検知する状態。",
  "where": "Collision Response で Block / Overlap / Ignore から選ぶ",
  "phrase": "On Component Begin Overlap — 重なり開始イベント",
  "category": "UE固有",
  "level": 1,
  "concept": "overlap",
  "match": "同義"
}
```

| フィールド | 内容 |
| --- | --- |
| `id` | 一意の番号。記録に使うため既存の値は変えない。UE は 1〜、Unity は 1001〜 |
| `en` / `ja` | 英単語 / 日本語の意味 |
| `note` | 一言解説（出題中にヒント表示） |
| `where` | 「どこで使う」。正解/スキップ後・展開表示で出る（任意） |
| `phrase` | 「実際の表記」（ノード名・API 名・C++/C# の書き方）。同上（任意） |
| `category` | `共通` または `<エンジン>固有` |
| `level` | `1`（頻出基礎）/ `2`（中級）/ `3`（応用） |
| `concept` / `match` | エンジン間の対応（上記「相互参照」参照。任意） |

### 展開表示に出すフィールドを増やす

`assets/sel-common.js` の `DETAIL_FIELDS` に 1 行足すだけで、単語一覧・苦手単語帳・統合辞典すべての展開表示に反映されます。検索対象にも含めたい場合は `assets/engine.js` の `buildSearchIndex()` と `assets/hub.js` の `buildSearchIndex()` の配列にキーを追加します。

---

## 新しいエンジンの追加（例: Godot 編）

1. **データを用意** — `public/data/words-godot.json` を作る。`id` は他とかぶらない帯（例 2001〜）。`concept` を既存の値に合わせると相互参照される
2. **登録簿を更新** — `public/assets/sel-common.js` の `ENGINES` の該当行を `status: "public"` に変更（`id` / `name` / `path` / `data` は既に定義済み。新規なら 1 行追加）
3. **ページを作る** — `public/ue/index.html` をコピーして `public/godot/index.html` を作り、以下を書き換える:
   - `<title>` と `<meta>` 群（description / og:* / twitter:* / canonical）
   - `window.SEL_PAGE`（`engineId` / `meta` / `ui`）
4. デプロイ

トップの統合辞典・各ページの相互参照・エンジン切り替えリンクは、`ENGINES` の `status` が `public` になった時点で自動的に対応します。

---

## メタ情報 / OGP

ページごとに `title` / `description` / OGP / canonical を個別に設定しています（Twitter で各版を個別共有したときに正しいカードが出るように）。

- 文言のマスターは各ページの `window.SEL_PAGE.meta`。`SEL.applyPageMeta()` が実行時に `<meta>` を上書きします
- クローラは JS を実行しないため、**同じ値を各 HTML の `<title>` と `<meta>` 群にも静的に書いてあります**。文言を変えるときは両方を更新してください
- `og:url` は各ページの実 URL（`/` `/ue/` `/unity/`）
- `og:image` は全ページ `/ogp.png`（**未同梱**。用意して `public/ogp.png` に置くと反映。無くてもページ・カードは壊れません）
- favicon は全ページ共通（`/favicon.svg` `/favicon.ico` `/apple-touch-icon.png`）

---

## デプロイ（Cloudflare Workers）

`wrangler.jsonc` に静的アセット配信の設定があります。

- `directory: "public"`（`public/` 以下を配信）。テスト用 HTML / `*.bak` などは `public/.assetsignore` で除外
- `html_handling: "auto-trailing-slash"` … `/ue` → `/ue/`、`/` → `/index.html`
- `not_found_handling: "none"` … 未知パスは 404

### 通常運用: `git push` で自動デプロイ

このプロジェクトは **Cloudflare Workers Builds** で GitHub リポジトリ
（`bullmusvg-debug/typing-terms`）と連携しています。
**`main` ブランチへ push すると Cloudflare 側で自動的にビルド・デプロイ**され、
`https://typing-terms.bullmus-vg.workers.dev/` に反映されます。

```
git add -A
git commit -m "..."
git push                 # → main への push で自動デプロイ
```

- デプロイ状況・履歴は Cloudflare ダッシュボード → **Workers & Pages** → `typing-terms`
  → **Deployments** / **Settings → Build** で確認できます
- `main` 以外のブランチや PR は本番に影響しません（設定によりプレビューが出る場合あり）
- ビルドは不要（静的アセットのみ）。Deploy command は `npx wrangler deploy`

### 緊急時: 手動デプロイ

Git 連携が使えない・即時反映したい等の場合のみ、ローカルから直接デプロイします。

```
npx wrangler deploy      # public/ 以下を本番へ即時配信
```

- 初回のみ `npx wrangler login` でブラウザ認証が必要
- **手動デプロイした内容は必ず同じものを `git push` してリポジトリと一致させる**こと
  （次回の自動デプロイで巻き戻らないように）

### ローカル確認

```
npx wrangler dev         # http://localhost:8787/
```

`file://` では `fetch` が動かないため、必ず `wrangler dev`（または任意の静的サーバー）を使います。

---

## ライセンス

MIT License. 詳細は [LICENSE](LICENSE) を参照してください。

## 商標について

Unreal Engine は Epic Games, Inc. の、Unity は Unity Technologies の、Godot は Godot 関連の、それぞれ商標または登録商標です。本ツールは非公式の個人制作物であり、上記各社・団体とは一切関係なく、承認・後援も受けていません。
