# Handbook Page Overrides

> **PROJECT:** SN0VV City
> **Generated:** 2026-11-13 13:57:12
> **Page Type:** General

> ⚠️ **IMPORTANT:** Rules in this file **override** the Master file (`design-system/MASTER.md`).
> Only deviations from the Master are documented here. For all other rules, refer to the Master.

---

## Page-Specific Rules

### Layout Overrides

- **Max Width:** 1200px (standard)
- **Layout:** Full-width sections, centered content

### Spacing Overrides

- No overrides — use Master spacing

### Typography Overrides

- Body 16px (LoRA 15–16px), line-height 1.75, measure ≤ 72ch, 12px hard floor for labels/badges/code
- Headings use `text-wrap: balance`; paragraphs `text-wrap: pretty`
- Fonts: `--hb-font-sans` / `--hb-font-serif` / `--hb-font-mono` system stacks (see `../handbook-tokens.css`)

### Color Overrides

- Each handbook keeps its own theme (Biglink dark teal, LoRA + tower floors paper/green); focus ring is SN0VV gold `#f0c372`
- Muted text must measure ≥ 4.5:1 on its actual card colour (Biglink `--mut` lifted #5f8a83 → #7fa9a1)

### Component Overrides

- Wide tables scroll inside their own box below 860px; inline desktop grid templates collapse to one column
- Buttons/summary ≥ 36px desktop, 44px on phones; inline term links keep prose flow but get a ≥ 24px tall hit area
- Reduced motion: no autoplay of demo theatres; continuous simulations start paused

---

## Page-Specific Components

- No unique components for this page

---

## Recommendations

- Effects: No motion blur, distinct page turns, grain/noise texture, sharp transitions (no fade)
