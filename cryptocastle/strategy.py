"""Die Handelsregel – bewusst einfach und ohne Seiteneffekte."""
from __future__ import annotations

from dataclasses import dataclass

from .config import Config


@dataclass(frozen=True)
class Decision:
    action: str  # "buy", "sell" oder "hold"
    reason: str


def sma(closes: list[float], days: int) -> float | None:
    if len(closes) < days:
        return None
    window = closes[-days:]
    return sum(window) / days


def decide(price: float, avg: float, eur: float, btc: float, cfg: Config) -> Decision:
    """Sparplan mit Trend-Filter.

    - Kurs > Durchschnitt (Aufwärtstrend): gesamten Euro-Topf in BTC investieren
    - Kurs mehr als crash_exit_pct % unter Durchschnitt: alle BTC verkaufen
    - sonst: nichts tun, Euro ansparen
    """
    deviation = price / avg - 1.0
    dev_txt = f"Kurs {deviation:+.1%} ggü. {cfg.sma_days}-Tage-Schnitt"

    if btc > 0 and deviation <= -cfg.crash_exit_pct / 100.0:
        return Decision("sell", f"Absturz-Schutz: {dev_txt}")
    if deviation > 0:
        if eur >= cfg.min_order_eur:
            return Decision("buy", f"Aufwärtstrend: {dev_txt}")
        return Decision("hold", f"Aufwärtstrend, aber Topf ({eur:.2f} €) < Mindestorder")
    return Decision("hold", f"Kein Aufwärtstrend: {dev_txt} – spare Euro an")
