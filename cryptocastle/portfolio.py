"""Das Bot-eigene Budget. Der Bot handelt nie mit mehr als diesem Bestand."""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path


def month_key(year: int, month: int) -> str:
    return f"{year:04d}-{month:02d}"


def months_after(last: str, current: str) -> list[str]:
    """Alle Monate nach `last` bis einschließlich `current` (Format JJJJ-MM)."""
    y, m = map(int, last.split("-"))
    out = []
    while True:
        m += 1
        if m > 12:
            y, m = y + 1, 1
        key = month_key(y, m)
        if key > current:
            return out
        out.append(key)


@dataclass
class Portfolio:
    eur: float = 0.0
    btc: float = 0.0
    deposited_eur: float = 0.0
    last_credit_month: str | None = None
    halted: bool = False

    def credit_monthly(self, current_month: str, amount: float) -> int:
        """Schreibt das Monatsbudget für alle noch nicht gutgeschriebenen Monate gut."""
        if self.last_credit_month is None:
            months = [current_month]
        else:
            months = months_after(self.last_credit_month, current_month)
        for _ in months:
            self.eur += amount
            self.deposited_eur += amount
        if months:
            self.last_credit_month = months[-1]
        return len(months)

    def value(self, price: float) -> float:
        return self.eur + self.btc * price

    def apply_buy(self, btc_filled: float, eur_cost: float) -> None:
        """eur_cost = alles, was vom Euro-Topf abgeht (inkl. Gebühr)."""
        self.btc += btc_filled
        self.eur = max(0.0, self.eur - eur_cost)

    def apply_sell(self, btc_sold: float, eur_received: float) -> None:
        """eur_received = Erlös nach Gebühr."""
        self.btc = max(0.0, self.btc - btc_sold)
        self.eur += eur_received

    # --- Simulation (Paper-Trading und Backtest) ---
    def simulate_buy(self, price: float, fee_rate: float) -> tuple[float, float, float]:
        spend = self.eur
        fee = spend * fee_rate
        btc = (spend - fee) / price
        self.apply_buy(btc, spend)
        return btc, spend, fee

    def simulate_sell(self, price: float, fee_rate: float) -> tuple[float, float, float]:
        btc = self.btc
        gross = btc * price
        fee = gross * fee_rate
        self.apply_sell(btc, gross - fee)
        return btc, gross - fee, fee

    # --- Speichern ---
    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(asdict(self), indent=2) + "\n")

    @classmethod
    def load(cls, path: Path) -> "Portfolio":
        if not path.exists():
            return cls()
        return cls(**json.loads(path.read_text()))
