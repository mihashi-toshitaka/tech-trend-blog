import { Hono } from "hono";
import { html, raw } from "hono/html";
import { marked } from "marked";

type Bindings = {
  DB: D1Database;
  EARLIEST_DATE?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

const DEFAULT_EARLIEST_DATE = "2025-12-25";

const formatJstDate = (date: Date) => {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
};

const isValidDateString = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const resolveDate = (input: string | undefined, fallback: string) => {
  if (!input || !isValidDateString(input)) {
    return fallback;
  }
  return input;
};

const validateDateRange = (date: string, minDate: string, maxDate: string) =>
  date >= minDate && date <= maxDate;

const fetchEntriesForDate = async (db: D1Database, date: string) => {
  const { results } = await db
    .prepare(
      "SELECT id, date, slot, raw_response, fetched_at FROM trend_entries WHERE date = ? ORDER BY slot ASC"
    )
    .bind(date)
    .all<{
      id: number;
      date: string;
      slot: number;
      raw_response: string;
      fetched_at: string;
    }>();
  return results ?? [];
};

const renderEntryHtml = (entry: {
  slot: number;
  raw_response: string;
  fetched_at: string;
}) => {
  const slotLabel = entry.slot === 0 ? "00:00 取得" : "12:00 取得";
  const content = marked.parse(entry.raw_response);
  return html`
    <article class="mb-4">
      <div class="d-flex flex-wrap justify-content-between align-items-center mb-2">
        <h2 class="h5 mb-0">${slotLabel}</h2>
        <span class="text-muted small">取得時刻 (UTC): ${entry.fetched_at}</span>
      </div>
      <div class="markdown-body">${raw(content)}</div>
    </article>
  `;
};

const renderEntries = (entries: Awaited<ReturnType<typeof fetchEntriesForDate>>) => {
  if (!entries.length) {
    return html`<p class="text-muted">この日付のデータは見つかりませんでした。</p>`;
  }

  return html`${entries.map((entry) => renderEntryHtml(entry))}`;
};

const renderPage = ({
  date,
  entries,
  minDate,
  maxDate,
}: {
  date: string;
  entries: Awaited<ReturnType<typeof fetchEntriesForDate>>;
  minDate: string;
  maxDate: string;
}) => html`
  <!doctype html>
  <html lang="ja">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Tech Trend Blog</title>
      <link
        href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css"
        rel="stylesheet"
        crossorigin="anonymous"
      />
      <style>
        body {
          background: #f8f9fa;
        }
        .blog-card {
          background: #ffffff;
          border-radius: 1rem;
          box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);
        }
        .markdown-body h1,
        .markdown-body h2,
        .markdown-body h3 {
          margin-top: 1.5rem;
        }
        .markdown-body pre {
          background: #0f172a;
          color: #e2e8f0;
          padding: 1rem;
          border-radius: 0.75rem;
        }
        .markdown-body code {
          background: #e2e8f0;
          padding: 0.1rem 0.3rem;
          border-radius: 0.25rem;
        }
      </style>
    </head>
    <body class="py-4">
      <div class="container">
        <header class="mb-4 text-center">
          <h1 class="display-6 fw-bold">Tech Trend Blog</h1>
          <p class="text-muted">
            xAI から取得した情報をまとめています。内容に誤りがある可能性があります。
          </p>
        </header>

        <section class="blog-card p-4 mb-4">
          <div class="row g-3 align-items-end">
            <div class="col-md-6">
              <label class="form-label fw-semibold">日付を選択</label>
              <input
                class="form-control"
                type="date"
                name="date"
                value="${date}"
                min="${minDate}"
                max="${maxDate}"
                x-data
                @change="$dispatch('date-change', { value: $event.target.value })"
              />
            </div>
            <div class="col-md-6 text-md-end">
              <button
                class="btn btn-primary"
                hx-get="/api/entry"
                hx-include="[name='date']"
                hx-target="#entry-content"
                hx-swap="innerHTML"
              >
                記事を表示
              </button>
            </div>
          </div>
          <p class="small text-muted mt-3 mb-0">
            ${minDate} から ${maxDate} まで遡れます。
          </p>
        </section>

        <section class="blog-card p-4" id="entry-content">
          ${renderEntries(entries)}
        </section>

        <footer class="text-center mt-4 text-muted small">
          Tech Trend Blog · Cloudflare Pages
        </footer>
      </div>
      <script src="https://cdn.jsdelivr.net/npm/htmx.org@1.9.12"></script>
      <script src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js" defer></script>
      <script>
        document.addEventListener("date-change", (event) => {
          const dateInput = document.querySelector("input[name='date']");
          if (!dateInput) return;
          dateInput.value = event.detail.value;
        });
      </script>
    </body>
  </html>
`;

const renderEntriesPartial = (
  entries: Awaited<ReturnType<typeof fetchEntriesForDate>>
) => html`${renderEntries(entries)}`;

app.get("/", async (c) => {
  const minDate = c.env.EARLIEST_DATE ?? DEFAULT_EARLIEST_DATE;
  const maxDate = formatJstDate(new Date());
  const date = resolveDate(c.req.query("date"), maxDate);
  const entries = validateDateRange(date, minDate, maxDate)
    ? await fetchEntriesForDate(c.env.DB, date)
    : [];
  return c.html(renderPage({ date, entries, minDate, maxDate }));
});

app.get("/date/:date", async (c) => {
  const minDate = c.env.EARLIEST_DATE ?? DEFAULT_EARLIEST_DATE;
  const maxDate = formatJstDate(new Date());
  const date = resolveDate(c.req.param("date"), maxDate);
  const entries = validateDateRange(date, minDate, maxDate)
    ? await fetchEntriesForDate(c.env.DB, date)
    : [];
  return c.html(renderPage({ date, entries, minDate, maxDate }));
});

app.get("/api/entry", async (c) => {
  const minDate = c.env.EARLIEST_DATE ?? DEFAULT_EARLIEST_DATE;
  const maxDate = formatJstDate(new Date());
  const date = resolveDate(c.req.query("date"), maxDate);
  if (!validateDateRange(date, minDate, maxDate)) {
    return c.html(
      html`<p class="text-danger">選択できる日付の範囲外です。</p>`
    );
  }
  const entries = await fetchEntriesForDate(c.env.DB, date);
  return c.html(renderEntriesPartial(entries));
});

export default app;
