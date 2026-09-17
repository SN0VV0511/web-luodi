"use client";

import { useState, useEffect } from "react";

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

export default function News({ locale }: { locale: "zh" | "en" }) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const categories = [
    { key: null, label: locale === "zh" ? "全部" : "All" },
    { key: "国际新闻", label: "🌍 " + (locale === "zh" ? "国际新闻" : "International") },
    { key: "AI资讯", label: "🤖 AI" },
    { key: "科技数码", label: "📱 " + (locale === "zh" ? "科技数码" : "Tech") },
    { key: "财经动态", label: "💰 " + (locale === "zh" ? "财经动态" : "Finance") },
  ];

  useEffect(() => {
    fetchNews();
  }, [page, selectedCategory]);

  const fetchNews = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "5",
      });
      if (selectedCategory) params.append("category", selectedCategory);
      
      const res = await fetch(`/news/api/news?${params}`);
      const data: NewsResponse = await res.json();
      setNews(data.news);
      setTotalPages(data.pages);
    } catch (err) {
      console.error("Failed to fetch news:", err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (ts: string) => {
    const d = new Date(ts + "Z");
    return d.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <section aria-labelledby="news-title" className="content-section" id="news">
      <header className="section-heading">
        <h2 id="news-title">{locale === "zh" ? "每日新闻" : "Daily News"}</h2>
        <p>
          {locale === "zh"
            ? "AI 整理的每日热点新闻，自动更新。"
            : "AI-curated daily news, updated automatically."}
        </p>
      </header>
      <div className="news-inner">
        <div className="news-categories">
          {categories.map((cat) => (
            <button
              key={cat.key || "all"}
              className={`news-cat-btn ${selectedCategory === cat.key ? "active" : ""}`}
              onClick={() => {
                setSelectedCategory(cat.key);
                setPage(1);
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="news-loading">
            {locale === "zh" ? "加载中..." : "Loading..."}
          </div>
        ) : news.length === 0 ? (
          <div className="news-empty">
            {locale === "zh" ? "暂无新闻" : "No news yet"}
          </div>
        ) : (
          <div className="news-list">
            {news.map((item) => {
              const isExpanded = expandedId === item.id;
              return (
                <article
                  className={`news-card${isExpanded ? " is-expanded" : ""}`}
                  key={item.id}
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                >
                  <div className="news-card-header">
                    <span className="news-badge">{item.category}</span>
                    <time className="news-time">{formatDate(item.created_at)}</time>
                  </div>
                  <h3 className="news-card-title">{item.title}</h3>
                  <p className="news-card-content">
                    {isExpanded
                      ? item.content
                      : item.content.length > 80
                        ? item.content.slice(0, 80) + "..."
                        : item.content}
                  </p>
                  {item.content.length > 80 && (
                    <span className="news-expand-hint">
                      {isExpanded
                        ? locale === "zh" ? "收起" : "Collapse"
                        : locale === "zh" ? "展开详情" : "Expand"}
                    </span>
                  )}
                </article>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="news-pagination">
            <button
              className="news-page-btn"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >
              ←
            </button>
            <span className="news-page-info">
              {page} / {totalPages}
            </span>
            <button
              className="news-page-btn"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              →
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
