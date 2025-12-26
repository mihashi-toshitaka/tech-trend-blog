# Hono + htmx + Alpine.js + Bootstrap 5 の利用概要

本プロジェクトは Cloudflare Pages Functions + 静的 HTML の構成で、以下のライブラリを役割分担して使っています。
本ドキュメントでは、実際にコード内でどのように利用しているかを、実装箇所とともに整理します。

## 全体構成

- **バックエンド (API)**: Cloudflare Pages Functions 上で Hono を利用して API を提供。
- **フロントエンド**: `public/index.html` を配信し、htmx で API 呼び出しを行って差分描画。
- **UI**: Bootstrap 5 のユーティリティ/コンポーネントクラスでスタイリング。
- **状態管理/軽量インタラクション**: Alpine.js を CDN で読み込み (現状は将来利用のための読み込みのみ)。

---

## Hono (Cloudflare Pages Functions)

**目的**: API エンドポイントの定義と HTML/JSON 返却。

**実装箇所**: `functions/api/[[path]].ts`

### 1. アプリケーションの初期化

```ts
const app = new Hono<{ Bindings: Bindings }>().basePath("/api");
```

- `basePath("/api")` を使い、`/api/*` に API を集約。
- `Bindings` 型で `DB` (D1) と `EARLIEST_DATE` を型付け。

### 2. `/api/meta` (JSON)

```ts
app.get("/meta", (c) => {
  const { minDate, maxDate, defaultDate } = getDateContext(
    c.env,
    c.req.query("date")
  );
  return c.json({ minDate, maxDate, defaultDate });
});
```

- フロントで日付レンジを初期化するためのメタ情報を返却。
- `EARLIEST_DATE` が未設定の場合は `DEFAULT_EARLIEST_DATE` を利用。

### 3. `/api/entry` (HTML)

```ts
app.get("/entry", async (c) => {
  const { minDate, maxDate, defaultDate } = getDateContext(
    c.env,
    c.req.query("date")
  );
  const date = defaultDate;
  if (!validateDateRange(date, minDate, maxDate)) {
    return c.html(
      html`<p class="text-danger">選択できる日付の範囲外です。</p>`
    );
  }
  const entries = await fetchEntriesForDate(c.env.DB, date);
  return c.html(renderEntries(entries));
});
```

- 日付レンジを検証し、問題がなければ D1 (`trend_entries`) から該当日の記事を取得。
- Hono の `html` / `raw` を使い、**HTML を返してフロントで差分描画**する設計。

### 4. Markdown の HTML 化

```ts
const content = marked.parse(entry.raw_response);
return html`
  <article class="mb-4">
    ...
    <div class="markdown-body">${raw(content)}</div>
  </article>
`;
```

- D1 に保存された Markdown を `marked` で HTML に変換。
- `raw` を利用して HTML として挿入。

---

## htmx

**目的**: クライアント側で API を呼び出し、DOM の一部だけを更新。

**実装箇所**: `public/index.html`

### 1. CDN 読み込み

```html
<script src="https://cdn.jsdelivr.net/npm/htmx.org@1.9.12"></script>
```

### 2. API 呼び出しと差分描画

```js
const loadEntries = () => {
  const dateInput = document.querySelector("input[name='date']");
  if (!dateInput) return;
  htmx.ajax("GET", "/api/entry", {
    target: "#entry-content",
    swap: "innerHTML",
    values: { date: dateInput.value },
  });
};
```

- `htmx.ajax` を使って `/api/entry` に GET リクエスト。
- `target: "#entry-content"` に HTML を差し替え。
- `/api/entry` は HTML を返すため、SPA 的にページ全体を再描画しない。

---

## Alpine.js

**目的**: 状態管理や UI の軽量インタラクションを簡潔に実装。

**実装箇所**: `public/index.html`

```html
<script src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js" defer></script>
```

- 現状は Alpine.js を読み込んでいるものの、`x-data` などの属性は未使用。
- 今後、
  - フィルタリング UI
  - 入力フォームのバリデーション
  - ローディング状態の切り替え
  などを Alpine.js で実装可能。

---

## Bootstrap 5

**目的**: レイアウト/デザインのベースを提供。

**実装箇所**: `public/index.html`

### 1. CDN 読み込み

```html
<link
  href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css"
  rel="stylesheet"
  crossorigin="anonymous"
/>
```

### 2. UI の主要パーツに利用

- **ヘッダー**
  - `text-center`, `display-6`, `fw-bold` など。
- **日付入力のカード**
  - `row`, `col-md-6`, `form-control`, `btn btn-primary` を使用。
- **記事表示エリア**
  - `p-4`, `mb-4`, `text-muted` で余白と文字色を調整。

```html
<section class="blog-card p-4 mb-4">
  <div class="row g-3 align-items-end">
    <div class="col-md-6">
      <label class="form-label fw-semibold">日付を選択</label>
      <input class="form-control" type="date" name="date" />
    </div>
    <div class="col-md-6 text-md-end">
      <button class="btn btn-primary" id="load-entry" type="button">
        記事を表示
      </button>
    </div>
  </div>
</section>
```

### 3. 追加のカスタムスタイル

- Bootstrap のベースに加えて、`<style>` でカードの影や Markdown 表示の微調整を実施。

---

## まとめ

- **Hono**: `/api` 配下の API を定義し、JSON と HTML を返却。
- **htmx**: HTML 断片を取得して `#entry-content` に差し替え。
- **Alpine.js**: CDN 読み込み済みだが、現状は未使用 (将来拡張用)。
- **Bootstrap 5**: レイアウト/スタイルに広く利用。

これらの組み合わせにより、**サーバーサイドで HTML を生成しつつ、フロントは軽量に差分更新**する構成になっています。
