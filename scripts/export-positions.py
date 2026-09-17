#!/usr/bin/env python3
"""导出持仓快照到落地页静态API: out/api/positions.json (供城市大屏读取)。"""
import json
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

DB = sys.argv[1] if len(sys.argv) > 1 else "/var/lib/docker/volumes/quant-a-stock_quant-data/_data/paper_v2.db"
OUT = Path("/opt/web-luodi/out/api/positions.json")


def main() -> None:
    db = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    rows = db.execute(
        "SELECT code, name, shares, avg_cost, last_price FROM positions WHERE shares > 0 ORDER BY shares * last_price DESC"
    ).fetchall()
    cash_row = db.execute(
        "SELECT cash FROM accounts WHERE account_id = 'paper_v2'"
    ).fetchone()
    db.close()

    positions = []
    market_value = 0.0
    cost_total = 0.0
    for r in rows:
        mv = r["shares"] * r["last_price"]
        cost = r["shares"] * r["avg_cost"]
        market_value += mv
        cost_total += cost
        positions.append(
            {
                "code": r["code"],
                "name": r["name"],
                "shares": r["shares"],
                "avgCost": round(r["avg_cost"], 3),
                "price": round(r["last_price"], 3),
                "marketValue": round(mv),
                "pnlPct": round((r["last_price"] / r["avg_cost"] - 1) * 100, 2) if r["avg_cost"] else 0,
            }
        )
    cash = float(cash_row["cash"]) if cash_row else 0.0
    payload = {
        "updatedAt": datetime.now().strftime("%m-%d %H:%M"),
        "positions": positions,
        "marketValue": round(market_value),
        "cash": round(cash),
        "totalValue": round(market_value + cash),
        "dayPnl": round(market_value - cost_total),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUT.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    tmp.replace(OUT)
    print(f"exported: {OUT} ({len(positions)} positions, total {payload['totalValue']})")


if __name__ == "__main__":
    main()
