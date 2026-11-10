"""Ein Bot-Durchlauf. Gedacht für einen wöchentlichen Aufruf (z. B. GitHub Actions).

    python -m cryptocastle.bot
"""
from __future__ import annotations

import argparse
import csv
import os
from datetime import datetime, timezone
from pathlib import Path

from .config import ROOT, Config, load_config
from .portfolio import Portfolio
from .strategy import Decision, decide, sma

STATE_PATH = ROOT / "state" / "state.json"
TRADES_PATH = ROOT / "trades.csv"
TRADE_FIELDS = ["zeit_utc", "modus", "aktion", "kurs_eur", "btc", "eur", "gebuehr_eur", "grund"]


def log_trade(path: Path, row: dict) -> None:
    new = not path.exists()
    with open(path, "a", newline="") as f:
        w = csv.DictWriter(f, fieldnames=TRADE_FIELDS)
        if new:
            w.writeheader()
        w.writerow(row)


def run(
    cfg: Config,
    price: float,
    closes: list[float],
    pf: Portfolio,
    now: datetime,
    trades_path: Path,
    trader=None,
) -> tuple[Decision, list[str]]:
    """Kern eines Durchlaufs, ohne Netzwerk – dadurch testbar."""
    lines: list[str] = []
    credited = pf.credit_monthly(now.strftime("%Y-%m"), cfg.monthly_budget_eur)
    if credited:
        lines.append(f"Monatsbudget gutgeschrieben: {credited} × {cfg.monthly_budget_eur:.2f} €")

    avg = sma(closes, cfg.sma_days)
    if avg is None:
        raise SystemExit(f"Zu wenig Kursdaten: {len(closes)} von {cfg.sma_days} Tagen")

    value = pf.value(price)
    if pf.deposited_eur > 0 and value < pf.deposited_eur * (1 - cfg.max_loss_pct / 100):
        pf.halted = True
    if pf.halted:
        decision = Decision("hold", "NOTBREMSE aktiv – Bot handelt nicht mehr (halted in state.json)")
    else:
        decision = decide(price, avg, pf.eur, pf.btc, cfg)

    result = None
    if decision.action == "buy":
        result = trader.buy(pf.eur, price) if trader else pf.simulate_buy(price, cfg.fee_rate)
        if trader and result:
            pf.apply_buy(result[0], result[1])
    elif decision.action == "sell":
        result = trader.sell(pf.btc) if trader else pf.simulate_sell(price, cfg.fee_rate)
        if trader and result:
            pf.apply_sell(result[0], result[1])

    if result:
        btc, eur, fee = result
        log_trade(trades_path, {
            "zeit_utc": now.strftime("%Y-%m-%d %H:%M"),
            "modus": cfg.mode,
            "aktion": "kauf" if decision.action == "buy" else "verkauf",
            "kurs_eur": f"{price:.2f}",
            "btc": f"{btc:.8f}",
            "eur": f"{eur:.2f}",
            "gebuehr_eur": f"{fee:.4f}",
            "grund": decision.reason,
        })

    lines += [
        f"Modus: {cfg.mode}",
        f"Kurs: {price:,.2f} € | {cfg.sma_days}-Tage-Schnitt: {avg:,.2f} €",
        f"Entscheidung: {decision.action.upper()} – {decision.reason}",
        f"Bestand: {pf.eur:.2f} € + {pf.btc:.8f} BTC = {pf.value(price):.2f} €",
        f"Eingezahlt: {pf.deposited_eur:.2f} € | Ergebnis: {pf.value(price) - pf.deposited_eur:+.2f} €",
    ]
    return decision, lines


def main() -> None:
    from .exchange import LiveTrader, market_snapshot, public_exchange

    ap = argparse.ArgumentParser(description="cryptocastle-Bot einmal ausführen")
    ap.add_argument("--config", type=Path, default=None)
    args = ap.parse_args()

    cfg = load_config(args.config)
    trader = LiveTrader(cfg) if cfg.mode == "live" else None
    price, closes = market_snapshot(public_exchange(cfg.exchange), cfg.symbol, cfg.sma_days)

    pf = Portfolio.load(STATE_PATH)
    _, lines = run(cfg, price, closes, pf, datetime.now(timezone.utc), TRADES_PATH, trader)
    pf.save(STATE_PATH)

    text = "\n".join(lines)
    print(text)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a") as f:
            f.write("## cryptocastle\n\n" + "\n".join(f"- {l}" for l in lines) + "\n")


if __name__ == "__main__":
    main()
