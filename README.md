# tech-trend-blog

## プロジェクトの資産

- Cloudflare Pages Functions (`functions/api/[[path]].ts`)
  - Hono を使ったルーティングで API を提供します。
- フロントエンド
  - `public/index.html` をビルドで `dist/` にコピーして配信します。
- D1 データベース (`trend_entries`)
  - `raw_response` に保存された Markdown を記事として表示します。
  - `slot` が 0/1 の両方ある場合は 2 本表示します。
- UI ライブラリ
  - Bootstrap 5 / htmx / Alpine.js を CDN 経由で読み込みます。
- 設定ファイル
  - `wrangler.toml` に D1 バインディングと `EARLIEST_DATE`（遡り開始日）を設定します。
- 依存関係
  - `package.json` に Hono / marked / Wrangler を定義しています。

## 開発環境構築手順

### 1. 前提条件

- Node.js 18 以上
- Cloudflare アカウントと Wrangler のログイン環境

### 2. 依存関係のインストール

```bash
npm install
```

### 3. D1 のセットアップ

1. D1 データベースを作成します。
2. `wrangler.toml` の `database_id` を作成した D1 の ID で置き換えます。
3. `trend_entries` テーブルが存在することを確認します。

### 4. ローカル起動

```bash
npx wrangler pages dev . --d1=DB
```

### 5. ビルド

```bash
npm run build
```

### 6. 環境変数

- `EARLIEST_DATE` : 過去記事の遡り開始日（初期値 `2025-12-25`）
