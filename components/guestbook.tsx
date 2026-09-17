"use client";

import { useState, useEffect } from "react";

type Message = {
  id: number;
  nickname: string;
  content: string;
  created_at: string;
};

export default function Guestbook({ locale }: { locale: "zh" | "en" }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [nickname, setNickname] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchMessages();
  }, []);

  const fetchMessages = async () => {
    try {
      const res = await fetch("/guestbook/api/messages");
      const data = await res.json();
      setMessages(data);
    } catch (err) {
      console.error("Failed to fetch messages:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim() || !content.trim()) {
      setError(locale === "zh" ? "昵称和内容不能为空" : "Nickname and content are required");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/guestbook/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: nickname.trim(), content: content.trim() }),
      });
      if (res.ok) {
        setNickname("");
        setContent("");
        fetchMessages();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to post");
      }
    } catch (err) {
      setError(locale === "zh" ? "发送失败，请重试" : "Failed to post, please retry");
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (ts: string) => {
    const d = new Date(ts + "Z");
    return d.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <section aria-labelledby="guestbook-title" className="content-section" id="guestbook">
      <header className="section-heading">
        <h2 id="guestbook-title">{locale === "zh" ? "留言板" : "Guestbook"}</h2>
        <p>
          {locale === "zh"
            ? "留下你的足迹，随便聊点什么。"
            : "Leave your mark, say anything."}
        </p>
      </header>
      <div className="guestbook-inner">
        <form className="guestbook-form" onSubmit={handleSubmit}>
          <div className="guestbook-row">
            <input
              className="guestbook-input"
              maxLength={20}
              onChange={(e) => setNickname(e.target.value)}
              placeholder={locale === "zh" ? "你的昵称" : "Your nickname"}
              type="text"
              value={nickname}
            />
          </div>
          <div className="guestbook-row">
            <textarea
              className="guestbook-textarea"
              maxLength={500}
              onChange={(e) => setContent(e.target.value)}
              placeholder={locale === "zh" ? "写点什么..." : "Write something..."}
              rows={3}
              value={content}
            />
          </div>
          {error && <p className="guestbook-error">{error}</p>}
          <button className="guestbook-submit" disabled={loading} type="submit">
            {loading
              ? locale === "zh" ? "发送中..." : "Posting..."
              : locale === "zh" ? "留言" : "Post"}
          </button>
        </form>
        <div className="guestbook-messages">
          {messages.length === 0 ? (
            <p className="guestbook-empty">
              {locale === "zh" ? "还没有留言，来抢个沙发吧！" : "No messages yet. Be the first!"}
            </p>
          ) : (
            messages.map((msg) => (
              <div className="guestbook-msg" key={msg.id}>
                <div className="guestbook-msg-header">
                  <strong className="guestbook-msg-name">{msg.nickname}</strong>
                  <time className="guestbook-msg-time">{formatTime(msg.created_at)}</time>
                </div>
                <p className="guestbook-msg-content">{msg.content}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
