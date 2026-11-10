from __future__ import annotations

import tomllib
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class Config:
    mode: str = "paper"
    exchange: str = "kraken"
    symbol: str = "BTC/EUR"
    monthly_budget_eur: float = 5.0
    sma_days: int = 200
    crash_exit_pct: float = 15.0
    min_order_eur: float = 5.0
    max_loss_pct: float = 50.0
    fee_pct: float = 0.4

    @property
    def fee_rate(self) -> float:
        return self.fee_pct / 100.0


def load_config(path: Path | None = None) -> Config:
    path = path or ROOT / "config.toml"
    with open(path, "rb") as f:
        raw = tomllib.load(f)
    flat: dict = {}
    for section in ("bot", "strategy", "safety"):
        flat.update(raw.get(section, {}))
    cfg = Config(**flat)
    if cfg.mode not in ("paper", "live"):
        raise ValueError(f"mode muss 'paper' oder 'live' sein, nicht {cfg.mode!r}")
    if cfg.monthly_budget_eur <= 0:
        raise ValueError("monthly_budget_eur muss größer als 0 sein")
    return cfg
