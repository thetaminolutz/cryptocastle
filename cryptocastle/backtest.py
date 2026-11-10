"""Backtest: Trend-Bot gegen normalen Sparplan, auf historischen Tageskursen.

    python -m cryptocastle.backtest --since 2018-01-01
"""
from __future__ import annotations

import argparse
import csv
import os
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from .config import ROOT, Config, load_config
from .portfolio import Portfolio
from .strategy import decide

CACHE = ROOT / "data" / "btc_eur_daily.csv"


# ---------------------------------------------------------------- Daten
def download_history(exchange_id: str, symbol: str, since: date) -> list[tuple[date, float]]:
    from .exchange import public_exchange

    ex = public_exchange(exchange_id)
    ts = int(datetime(since.year, since.month, since.day, tzinfo=timezone.utc).timestamp() * 1000)
    rows: dict[date, float] = {}
    while True:
        batch = ex.fetch_ohlcv(symbol, "1d", since=ts, limit=1000)
        if not batch:
            break
        for c in batch:
            rows[datetime.fromtimestamp(c[0] / 1000, timezone.utc).date()] = float(c[4])
        nxt = batch[-1][0] + 86_400_000
        if nxt <= ts or len(batch) < 2:
            break
        ts = nxt
    today = datetime.now(timezone.utc).date()
    return sorted((d, p) for d, p in rows.items() if d < today)


def read_csv(path: Path) -> list[tuple[date, float]]:
    with open(path) as f:
        return [(date.fromisoformat(r["datum"]), float(r["schluss_eur"])) for r in csv.DictReader(f)]


def write_csv(path: Path, rows: list[tuple[date, float]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["datum", "schluss_eur"])
        w.writerows((d.isoformat(), f"{p:.2f}") for d, p in rows)


# ---------------------------------------------------------------- Simulation
@dataclass
class Result:
    name: str
    pf: Portfolio = field(default_factory=Portfolio)
    trades: int = 0
    peak: float = 0.0
    max_drawdown: float = 0.0
    year_end: dict[int, float] = field(default_factory=dict)

    def mark(self, d: date, price: float) -> None:
        v = self.pf.value(price)
        self.peak = max(self.peak, v)
        if self.peak:
            self.max_drawdown = max(self.max_drawdown, (self.peak - v) / self.peak)
        if d.month == 12 and d.day == 31:
            self.year_end[d.year] = v


def simulate(rows: list[tuple[date, float]], cfg: Config, start: date) -> tuple[Result, Result]:
    dca, bot = Result("Normaler Sparplan"), Result("Trend-Bot")
    closes: list[float] = []
    last_close = None
    for d, price in rows:
        if d >= start:
            month = d.strftime("%Y-%m")
            for r in (dca, bot):
                r.pf.credit_monthly(month, cfg.monthly_budget_eur)
            # Sparplan: kauft bei jeder Einzahlung sofort
            if dca.pf.eur >= cfg.min_order_eur:
                dca.pf.simulate_buy(price, cfg.fee_rate)
                dca.trades += 1
            # Bot: prüft einmal pro Woche (montags), Schnitt aus abgeschlossenen Tagen
            if d.weekday() == 0 and len(closes) >= cfg.sma_days:
                avg = sum(closes[-cfg.sma_days:]) / cfg.sma_days
                dec = decide(price, avg, bot.pf.eur, bot.pf.btc, cfg)
                if dec.action == "buy":
                    bot.pf.simulate_buy(price, cfg.fee_rate)
                    bot.trades += 1
                elif dec.action == "sell":
                    bot.pf.simulate_sell(price, cfg.fee_rate)
                    bot.trades += 1
            for r in (dca, bot):
                r.mark(d, price)
        closes.append(price)
        last_close = (d, price)
    if last_close:
        for r in (dca, bot):
            r.year_end[last_close[0].year] = r.pf.value(last_close[1])
    return dca, bot


def report(dca: Result, bot: Result, rows, start: date) -> str:
    end_d, end_p = rows[-1]
    out = [
        f"## Backtest {start} bis {end_d}",
        "",
        "| | Normaler Sparplan | Trend-Bot |",
        "|---|---:|---:|",
    ]
    def row(label, f):
        out.append(f"| {label} | {f(dca)} | {f(bot)} |")
    row("Eingezahlt", lambda r: f"{r.pf.deposited_eur:,.2f} €")
    row("Endwert", lambda r: f"{r.pf.value(end_p):,.2f} €")
    row("Gewinn", lambda r: f"{r.pf.value(end_p) - r.pf.deposited_eur:+,.2f} €")
    row("Rendite auf Einzahlungen", lambda r: f"{r.pf.value(end_p) / r.pf.deposited_eur - 1:+.1%}")
    row("Größter Verlust vom Höchststand", lambda r: f"{r.max_drawdown:.1%}")
    row("Anzahl Trades", lambda r: str(r.trades))
    row("Davon jetzt in Euro", lambda r: f"{r.pf.eur:,.2f} €")
    out += ["", "### Wert am Jahresende", "", "| Jahr | Sparplan | Trend-Bot |", "|---|---:|---:|"]
    for y in sorted(dca.year_end):
        out.append(f"| {y} | {dca.year_end[y]:,.2f} € | {bot.year_end[y]:,.2f} € |")
    return "\n".join(out)


def main() -> None:
    ap = argparse.ArgumentParser(description="Backtest Trend-Bot vs. Sparplan")
    ap.add_argument("--since", default="2018-01-01", help="Startdatum des Sparplans")
    ap.add_argument("--exchange", default="bitstamp", help="Datenquelle (lange BTC/EUR-Historie)")
    ap.add_argument("--csv", type=Path, default=None, help="Eigene Kursdatei (datum,schluss_eur)")
    ap.add_argument("--refresh", action="store_true", help="Kursdaten neu herunterladen")
    args = ap.parse_args()

    cfg = load_config()
    start = date.fromisoformat(args.since)
    if args.csv:
        rows = read_csv(args.csv)
    elif CACHE.exists() and not args.refresh:
        rows = read_csv(CACHE)
    else:
        rows = download_history(args.exchange, cfg.symbol, start - timedelta(days=cfg.sma_days + 30))
        write_csv(CACHE, rows)

    dca, bot = simulate(rows, cfg, start)
    text = report(dca, bot, rows, start)
    print(text)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a") as f:
            f.write(text + "\n")


if __name__ == "__main__":
    main()
