"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { ArrowUpRight, Bookmark, Mail, Save } from "lucide-react";
import {
  communityLinks,
  GUESTBOOK_DRAFT_KEY,
  GUESTBOOK_MESSAGE_LIMIT,
  GUESTBOOK_NAME_LIMIT,
  parseGuestbookDraft,
  readingList,
  type GuestbookDraft,
} from "@/lib/community-content";
import News from "@/components/news";
import type { Locale } from "@/lib/site-content";

const copy = {
  zh: {
    journal: "城市通讯",
    journalTitle: "阅读与灵感",
    journalIntro: "一些值得停下来读一读的地方。",
    curated: "阅读精选 · 非实时新闻",
    newsLink: "访问新闻源",
    guestbook: "街角留言板",
    guestbookTitle: "在这里，留下一点回声。",
    guestbookIntro: "路过这座小城，有什么想说的？",
    publicLink: "打开公共留言板",
    privateNote: "草稿仅保存在此浏览器。接入公共留言板后，可前往留言板发布。",
    connectedNote: "在这里保存私人草稿，前往公共留言板发布。草稿不会自动发送。",
    name: "怎么称呼你",
    namePlaceholder: "你的昵称",
    message: "写下一句问候或一个想法",
    messagePlaceholder: "今天，在这座小城里发现了什么？",
    save: "保存草稿",
    preview: "你的便签预览",
    previewName: "你的署名",
    previewMessage: "一声问候、一个灵感，或是下次再来的约定。",
    private: "本地草稿 · 未公开",
    saved: "草稿已保存在此浏览器，刷新后仍可继续编辑。",
    restored: "已恢复此浏览器中保存的草稿。",
    required: "请填写昵称和留言，再保存草稿。",
    tooLong: "昵称最多 40 字，留言最多 280 字。",
    invalid: "已有草稿格式无法读取，原记录未修改。保存新草稿会替换原记录。",
    readError: "浏览器暂时无法读取草稿。仍可在这里写下想法。",
    writeError:
      "草稿未能保存，浏览器存储可能已满或被禁用。内容仍在输入框中，请先复制留存。",
  },
  en: {
    journal: "CITY JOURNAL",
    journalTitle: "Reading & inspiration",
    journalIntro: "A few places worth slowing down for.",
    curated: "CURATED READING · NOT A LIVE FEED",
    newsLink: "Visit the news source",
    guestbook: "THE CORNER GUESTBOOK",
    guestbookTitle: "Leave a little echo here.",
    guestbookIntro: "Passing through? Leave a thought for this little city.",
    publicLink: "Open the public guestbook",
    privateNote:
      "Drafts stay in this browser. Once a public guestbook is connected, you can publish there.",
    connectedNote:
      "Save a private draft here, then visit the public guestbook to publish. Nothing is sent automatically.",
    name: "What should we call you?",
    namePlaceholder: "Your nickname",
    message: "A greeting, a thought, a little note",
    messagePlaceholder: "What did you discover in the city today?",
    save: "Save draft",
    preview: "YOUR NOTE PREVIEW",
    previewName: "Your signature",
    previewMessage:
      "A hello, a spark of inspiration, or a promise to visit again.",
    private: "LOCAL DRAFT · NOT PUBLIC",
    saved: "Draft saved in this browser. You can keep editing after a refresh.",
    restored: "Your saved draft has been restored from this browser.",
    required: "Add your nickname and a message before saving.",
    tooLong: "Use up to 40 characters for your name and 280 for your message.",
    invalid:
      "The existing draft could not be read and has not been changed. Saving a new draft will replace it.",
    readError:
      "This browser could not load the draft. You can still write your note here.",
    writeError:
      "The draft could not be saved. Browser storage may be full or disabled. Your text is still here; copy it somewhere safe.",
  },
} as const;

type DraftStatus =
  | "saved"
  | "restored"
  | "required"
  | "tooLong"
  | "invalid"
  | "readError"
  | "writeError"
  | null;

/** 城市阅读入口与本地留言草稿，不代替公共留言发布服务。 */
export function CommunityPanels({ locale }: Readonly<{ locale: Locale }>) {
  const t = copy[locale];
  const id = useId();
  const [draft, setDraft] = useState<GuestbookDraft>({ name: "", message: "" });
  const [status, setStatus] = useState<DraftStatus>(null);

  useEffect(() => {
    let raw: string | null;
    try {
      raw = window.localStorage.getItem(GUESTBOOK_DRAFT_KEY);
    } catch {
      setStatus("readError");
      return;
    }
    if (raw === null) return;
    try {
      const restored = parseGuestbookDraft(JSON.parse(raw));
      if (restored) {
        setDraft(restored);
        setStatus("restored");
      } else setStatus("invalid");
    } catch {
      setStatus("invalid");
    }
  }, []);

  const saveDraft = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = { name: draft.name.trim(), message: draft.message.trim() };
    if (!next.name || !next.message) {
      setStatus("required");
      return;
    }
    if (!parseGuestbookDraft(next)) {
      setStatus("tooLong");
      return;
    }
    try {
      window.localStorage.setItem(GUESTBOOK_DRAFT_KEY, JSON.stringify(next));
      setDraft(next);
      setStatus("saved");
    } catch {
      setStatus("writeError");
    }
  };
  const validationError = status === "required" || status === "tooLong";

  return (
    <div className="community-grid">
      <section
        className="community-card journal-card"
        id="news"
        aria-labelledby={`${id}-journal`}
      >
        <p className="section-kicker">
          <Bookmark size={15} aria-hidden="true" />
          {t.journal}
          <span>01—03</span>
        </p>
        <News locale={locale} />
        <div className="community-heading">
          <h2 id={`${id}-journal`}>{t.journalTitle}</h2>
          <p>{t.journalIntro}</p>
        </div>
        <p className="journal-label">{t.curated}</p>
        <ol className="journal-list">
          {readingList.map((entry, index) => (
            <li key={entry.href}>
              <a
                className="journal-entry"
                href={entry.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="journal-number" aria-hidden="true">
                  0{index + 1}
                </span>
                <span className="journal-entry-copy">
                  <small>{entry.category[locale]}</small>
                  <h3>{entry.title[locale]}</h3>
                  <p>{entry.description[locale]}</p>
                </span>
                <ArrowUpRight size={19} aria-hidden="true" />
              </a>
            </li>
          ))}
        </ol>
        {communityLinks.news && (
          <a
            className="button community-source"
            href={communityLinks.news}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t.newsLink}
            <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        )}
      </section>

      <section
        className="community-card guestbook-card"
        id="guestbook"
        aria-labelledby={`${id}-guestbook`}
      >
        <p className="section-kicker">
          <Mail size={15} aria-hidden="true" />
          {t.guestbook}
          <span>DEAR CITY,</span>
        </p>
        <div className="community-heading">
          <h2 id={`${id}-guestbook`}>{t.guestbookTitle}</h2>
          <p>{t.guestbookIntro}</p>
        </div>
        <div className="guestbook-note" aria-label={t.preview}>
          <span className="guestbook-note-label">{t.preview}</span>
          <Mail className="guestbook-stamp" size={25} aria-hidden="true" />
          <p>{draft.message || t.previewMessage}</p>
          <footer>
            <span>— {draft.name || t.previewName}</span>
            <small>{t.private}</small>
          </footer>
        </div>
        {communityLinks.guestbook && (
          <a
            className="button guestbook-public"
            href={communityLinks.guestbook}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t.publicLink}
            <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        )}
        <form
          className="guestbook-form"
          onSubmit={saveDraft}
          noValidate
          aria-describedby={`${id}-privacy`}
        >
          <div className="field-row">
            <label htmlFor={`${id}-name`}>{t.name}</label>
            <span>
              {draft.name.length}/{GUESTBOOK_NAME_LIMIT}
            </span>
          </div>
          <input
            id={`${id}-name`}
            name="nickname"
            autoComplete="nickname"
            placeholder={t.namePlaceholder}
            value={draft.name}
            maxLength={GUESTBOOK_NAME_LIMIT}
            required
            aria-invalid={
              validationError &&
              (!draft.name.trim() || draft.name.length > GUESTBOOK_NAME_LIMIT)
            }
            onChange={(event) => {
              setDraft({ ...draft, name: event.target.value });
              setStatus(null);
            }}
          />
          <div className="field-row">
            <label htmlFor={`${id}-message`}>{t.message}</label>
            <span>
              {draft.message.length}/{GUESTBOOK_MESSAGE_LIMIT}
            </span>
          </div>
          <textarea
            id={`${id}-message`}
            name="message"
            placeholder={t.messagePlaceholder}
            rows={3}
            value={draft.message}
            maxLength={GUESTBOOK_MESSAGE_LIMIT}
            required
            aria-invalid={
              validationError &&
              (!draft.message.trim() ||
                draft.message.length > GUESTBOOK_MESSAGE_LIMIT)
            }
            onChange={(event) => {
              setDraft({ ...draft, message: event.target.value });
              setStatus(null);
            }}
          />
          <div className="guestbook-actions">
            <p className="form-note" id={`${id}-privacy`}>
              {communityLinks.guestbook ? t.connectedNote : t.privateNote}
            </p>
            <button className="button guestbook-save" type="submit">
              <Save size={16} aria-hidden="true" />
              {t.save}
            </button>
          </div>
          <p
            className="form-note form-status"
            role="status"
            aria-live="polite"
            data-error={
              status !== null && !["saved", "restored"].includes(status)
            }
          >
            {status ? t[status] : ""}
          </p>
        </form>
      </section>
    </div>
  );
}
