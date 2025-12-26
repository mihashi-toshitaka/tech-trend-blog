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

app.get("/api/meta", (c) => {
  const minDate = c.env.EARLIEST_DATE ?? DEFAULT_EARLIEST_DATE;
  const maxDate = formatJstDate(new Date());
  const defaultDate = resolveDate(c.req.query("date"), maxDate);
  return c.json({ minDate, maxDate, defaultDate });
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
  return c.html(renderEntries(entries));
});

export default app;
