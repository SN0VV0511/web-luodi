"use client";

import { useEffect, useState, type KeyboardEvent } from "react";

type NewsItem = {
  id: number;
  title: string;
  content: string;
  category: string;
  source: string;
  created_at: string;
};

type NewsResponse = {
  news: NewsItem[];
  total: number;
  page: number;
  limit: number;
  pages: number;
};

const PAGE_SIZE = 5;
/** 正文超过该字数才显示“展开”提示；折叠由 CSS 行数截断完成。 */
const EXPAND_THRESHOLD = 80;

export default function News({ locale }: { locale: "zh" | "en" }) {
  const zh = locale === "zh";
  const [news, setNews] = useState<NewsItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const categories = [
    { key: null, label: zh ? "全部" : "All" },
    { key: "国际新闻", label: zh ? "国际" : "World" },
    { key: "AI资讯", label: "AI" },
    { key: "科技数码", label: zh ? "科技" : "Tech" },
    { key: "财经动态", label: zh ? "财经" : "Finance" },
  ];

  useEffect(() => {
    // 切换分类或翻页时中断旧请求，避免慢响应覆盖新结果。
    const controller = new AbortController();
    (async () => {
      setStatus("loading");
      try {
        const params = new URLSearchParams({
          page: page.toString(),
          limit: PAGE_SIZE.toString(),
        });
        if (selectedCategory) params.append("category", selectedCategory);
        const res = await fetch(`/news/api/news?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: NewsResponse = await res.json();
        setNews(Array.isArray(data.news) ? data.news : []);
        setTotalPages(Number.isFinite(data.pages) ? data.pages : 0);
        setStatus("ready");
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("Failed to fetch news:", err);
        setStatus("error");
      }
    })();
    return () => controller.abort();
  }, [page, selectedCategory, reloadKey]);

  const formatDate = (ts: string) => {
    const d = new Date(ts + "Z");
    return d.toLocaleDateString(zh ? "zh-CN" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const toggleExpanded = (id: number): void => {
    setExpandedId((current) => (current === id ? null : id));
  };

  const cardKeyDown = (event: KeyboardEvent<HTMLElement>, id: number): void => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleExpanded(id);
    }
  };

  const turnPage = (next: number): void => {
    setPage(next);
    setExpandedId(null);
  };

  return (
    <section aria-labelledby="news-title" className="content-section">
      <header className="section-heading">
        <div>
          <h2 id="news-title">{zh ? "每日新闻" : "Daily News"}</h2>
          <p>
            {zh
              ? "AI 整理的每日热点新闻，自动更新。"
              : "AI-curated daily news, updated automatically."}
          </p>
        </div>
        <span aria-hidden="true">AUTO · DAILY</span>
      </header>
      <div className="news-inner">
        <div className="news-categories" role="group" aria-label={zh ? "新闻分类" : "News categories"}>
          {categories.map((cat) => (
            <button
              key={cat.key || "all"}
              type="button"
              className={`news-cat-btn ${selectedCategory === cat.key ? "active" : ""}`}
              aria-pressed={selectedCategory === cat.key}
              onClick={() => {
                setSelectedCategory(cat.key);
                setPage(1);
                setExpandedId(null);
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {status === "loading" ? (
          <div className="news-list" aria-hidden="true">
            {Array.from({ length: 3 }).map((_, index) => (
              <div className="news-card is-skeleton" key={index}>
                <div className="skeleton-row skeleton-tag" />
                <div className="skeleton-row" style={{ width: "86%" }} />
                <div className="skeleton-row" style={{ width: "64%" }} />
              </div>
            ))}
          </div>
        ) : status === "error" ? (
          <div className="news-empty">
            <p>{zh ? "今天的报纸还没送到，稍后再试试。" : "The paper has not arrived yet. Try again later."}</p>
            <button type="button" className="news-retry" onClick={() => setReloadKey((value) => value + 1)}>
              {zh ? "重新加载" : "Reload"}
            </button>
          </div>
        ) : news.length === 0 ? (
          <div className="news-empty">
            {zh ? "今天还没有新闻，晚点再来看看。" : "No news yet today. Check back later."}
          </div>
        ) : (
          <div className="news-list">
            {news.map((item) => {
              const isExpanded = expandedId === item.id;
              const expandable = item.content.length > EXPAND_THRESHOLD;
              return (
                <article
                  className={`news-card${isExpanded ? " is-expanded" : ""}`}
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  aria-expanded={expandable ? isExpanded : undefined}
                  onClick={() => toggleExpanded(item.id)}
                  onKeyDown={(event) => cardKeyDown(event, item.id)}
                >
                  <div className="news-card-header">
                    <span className="news-badge">{item.category}</span>
                    <time className="news-time">{formatDate(item.created_at)}</time>
                  </div>
                  <h3 className="news-card-title">{item.title}</h3>
                  <p className="news-card-content">{item.content}</p>
                  {expandable && (
                    <span className="news-expand-hint" aria-hidden="true">
                      {isExpanded ? (zh ? "收起" : "Collapse") : zh ? "展开全文" : "Expand"}
                    </span>
                  )}
                </article>
              );
            })}
          </div>
        )}

        {totalPages > 1 && status === "ready" && (
          <div className="news-pagination">
            <button
              type="button"
              className="news-page-btn"
              disabled={page <= 1}
              aria-label={zh ? "上一页" : "Previous page"}
              onClick={() => turnPage(page - 1)}
            >
              ←
            </button>
            <span className="news-page-info">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              className="news-page-btn"
              disabled={page >= totalPages}
              aria-label={zh ? "下一页" : "Next page"}
              onClick={() => turnPage(page + 1)}
            >
              →
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
