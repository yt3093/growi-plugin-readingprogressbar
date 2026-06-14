# CLAUDE.md

## プロジェクト概要

- **名前**: `growi-plugin-readingprogressbar`
- **種別**: GROWI Script プラグイン
- **目的**: wiki ページの閲覧割合をヘッダー直下のプログレスバーで表示する

### 確定仕様

| 項目 | 内容 |
|---|---|
| 表示位置 | GROWI ヘッダー直下（`position: fixed` + JS でヘッダー高さを動的取得） |
| バーの高さ | 3px |
| バーの色 | CSS 変数 `--bs-primary` → `--primary` → `#3091c7` の順にフォールバック |
| 非表示条件 | 編集モード・管理画面（`/admin`）・印刷時 |
| SPA 遷移 | `pushState` / `replaceState` モンキーパッチ + `popstate` + `hashchange` で検知してリセット |
| deactivate | DOM 削除・全イベントリスナー解除・MutationObserver.disconnect・モンキーパッチ復元 |

## アーキテクチャ

このプラグインは Markdown レンダリングの拡張ではなく **DOM 直接操作** を行う。`customGenerateViewOptions` は使わず、`activate()` 内でプログレスバー要素を生成して `document.body` に追加する。

### ファイル構成

```
growi-plugin-readingprogressbar/
├── client-entry.tsx                    # activate / deactivate + pluginActivators 登録
├── src/
│   ├── readingProgressBar.ts           # コア実装（DOM 生成・スクロール監視・遷移検知）
│   ├── types.ts                        # GrowiFacade / Window 型の最小宣言
│   └── styles/readingProgressBar.css   # バーのスタイル・@media print
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts                      # build.manifest: 'manifest.json' を明示
├── pnpm-workspace.yaml                 # approve-builds で自動生成（コミット必須）
└── dist/                               # ビルド成果物（コミット必須）
    ├── manifest.json
    └── assets/
        ├── client-entry-*.js
        └── client-entry-*.css
```

### 主要な実装ポイント

**`createReadingProgressBar()`** が公開 API で `{ mount, unmount }` を返す。

- **スクロール進捗計算**: `window.scrollY / (scrollHeight - innerHeight)` を `requestAnimationFrame` で間引いて更新
- **ヘッダー高さ取得**: `.grw-navbar` → `nav.navbar` → `header[role=banner]` → `header` の順にセレクタを試す
- **編集モード判定**: `location.hash === '#edit'` / `pathname.endsWith('/edit')` / `body.classList` のいずれかで判定
- **SPA 遷移検知**: `pushState` / `replaceState` にカスタムイベントをモンキーパッチ。`popstate` / `hashchange` も併せて購読
- **body クラス変化の検知**: `MutationObserver` で `attributeFilter: ['class']` を指定して `body` の `editing` クラス付け外しを検知
- **`rafId` のリセット**: `updateBar()` 先頭で必ず `rafId = null` する。早期 return のパスでもリセットしないと次回 `scheduleUpdate` がスキップされる（過去のバグ）

## ハマりどころ (必読)

### 1. `dist/` を git にコミットすること

GROWI はプラグインインストール時に **`pnpm install` も `pnpm build` も実行しない**。GitHub の archive zip を展開し、`dist/` 配下を Express で静的配信するだけ。

→ `.gitignore` に `dist/` を含めると GROWI 側で JS が読み込まれない。`dist/` は必ずコミットすること。

(根拠: `weseek/growi` の `apps/app/src/features/growi-plugin/server/services/growi-plugin/growi-plugin.ts` 内 `install()` / `retrievePluginManifest()`)

### 2. Vite のマニフェスト出力先

GROWI が読みに行く manifest のパスは以下の順で fallback:

1. `dist/.vite/manifest.json` (Vite 5 デフォルト)
2. `dist/manifest.json` (Vite 4 互換 / 明示設定時)

Vite 5+ では `vite.config.ts` で `build.manifest: 'manifest.json'` を明示してプロジェクト直下風のパスに出力するのが無難。

```ts
export default defineConfig({
  plugins: [react()],
  build: {
    manifest: 'manifest.json',
    rollupOptions: { input: ['/client-entry.tsx'] },
  },
});
```

### 3. pnpm のビルドスクリプト承認 (pnpm 11+ では別対応が必要)

`esbuild` (Vite 依存) はインストール時にビルドスクリプト (`postinstall` の `node install.js`) を実行する必要があるが、pnpm はデフォルトでブロックする。

**pnpm 8〜10**: `package.json` の `pnpm.onlyBuiltDependencies` で明示する。

**pnpm 11+**: 上記設定は無視される。初回 `pnpm install` 後に以下のエラーが出る:

```
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: esbuild@X.Y.Z
```

解決手順:

1. `pnpm approve-builds --all` を実行
2. `pnpm-workspace.yaml` が自動生成される（**git にコミットすること**）
3. 再度 `pnpm install` を実行して esbuild の postinstall を完了させる

### 4. 再インストールが必要

コード更新を push しても、GROWI 管理画面で「有効/無効トグル」だけでは zip が取り直されない。確実に反映するには `/admin/plugins` で **削除 → 再インストール**。

### 5. Edit モード終了後の再表示（過去のバグと修正）

`updateBar()` で早期 `return` するパスがある場合、`rafId = null` を関数末尾に置くと古い frameID が残り続ける。次の `scheduleUpdate` 呼び出しが `rafId !== null` でスキップされて永久に更新されなくなる。**`rafId = null` は `updateBar()` の先頭で必ず実行すること。**

また Edit → View 遷移で `location.hash` のみが変わる場合、`pushState` のモンキーパッチは発火しない。`hashchange` イベントの購読が必須。さらに `body.classList` の変化を MutationObserver で検知するには `attributes: true, attributeFilter: ['class']` が必要（デフォルトの `attributes: false` では検知されない）。

## デプロイ手順

```bash
pnpm build              # dist/ を更新
git add src/ dist/ ...  # 変更ファイルを staging
git commit -m "..."
git push
```

GROWI 管理画面 `/admin/plugins` で **削除 → 再インストール**。

## 動作確認チェックリスト

1. `pnpm build` が成功し `dist/manifest.json` が出力される
2. GROWI で削除 → 再インストール後、DevTools Network で `client-entry-*.js` が 200 で取得される
3. 長文ページでスクロールするとバーが 0% → 100% へ変化する
4. バーの色が GROWI の primary カラーと一致する
5. 別ページに遷移すると進捗が 0% にリセットされる
6. 編集モード中はバーが非表示になる
7. 編集モード終了後にバーが再表示される
8. 管理画面（`/admin`）ではバーが非表示になる
9. 印刷プレビューでバーが表示されない
10. プラグイン無効化でバーが完全に消える（リスナー残存なし）

## 会話ガイドライン

- 常に日本語で会話する

## 作業ルール

- **git 操作は行わない**。`git add` / `git commit` / `git push` / `git restore` / `git checkout` などの git コマンドは一切実行しないこと。コミットやプッシュが必要な場面ではユーザーに依頼し、こちらでは行わない。
  - 変更内容のサマリだけ提示し、コミットメッセージ案を出す程度に留める。
  - 例外として `git status` / `git log` / `git diff` などの**読み取り専用**コマンドは状況把握のために実行してよい。

- **セキュリティチェックを必ず行う**。コード変更を完了したら、コミット候補としてユーザーに提示する前に以下を確認すること。問題が見つかった場合はその場で修正するか、ユーザーに明示的に報告する。
  - **機密情報の混入**: API キー / トークン / パスワード / 秘密鍵 / `.env` 系ファイルの値が、ソースコード・コメント・`dist/` 配下のビルド成果物に含まれていないか。
  - **XSS / 危険な HTML 挿入**: ユーザー入力を `dangerouslySetInnerHTML`・`innerHTML` で未エスケープで埋め込んでいないか。DOM 操作は `createElement` + `setAttribute` のみを使うこと。
  - **外部通信**: 外部 URL に対する `fetch` / `XMLHttpRequest` を新規追加していないか。
  - **依存パッケージの脆弱性**: 新規追加した npm パッケージは `pnpm audit` を実行して確認する。
  - **CSP / 外部リソース**: `<script>` / `<link>` を動的挿入して外部ドメインから読み込む実装になっていないか。自己完結なバンドルにすること。
