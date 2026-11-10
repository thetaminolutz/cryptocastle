"""Zugriff auf die Börse über ccxt: Marktdaten und (nur im Live-Modus) echte Orders."""
from __future__ import annotations

import os
import time
from datetime import datetime, timezone

import ccxt

from .config import Config


def public_exchange(exchange_id: str) -> ccxt.Exchange:
    return getattr(ccxt, exchange_id)({"enableRateLimit": True})


def market_snapshot(ex: ccxt.Exchange, symbol: str, days: int) -> tuple[float, list[float]]:
    """Aktueller Kurs und Schlusskurse der letzten abgeschlossenen Tageskerzen."""
    candles = ex.fetch_ohlcv(symbol, "1d", limit=days + 10)
    today = datetime.now(timezone.utc).date()
    closes = [
        c[4] for c in candles
        if datetime.fromtimestamp(c[0] / 1000, timezone.utc).date() < today
    ]
    price = float(ex.fetch_ticker(symbol)["last"])
    return price, closes


class LiveTrader:
    """Echte Orders auf Kraken. Handelt nie mit mehr als dem Bot-Budget."""

    def __init__(self, cfg: Config):
        key = os.environ.get("KRAKEN_API_KEY")
        secret = os.environ.get("KRAKEN_API_SECRET")
        if not key or not secret:
            raise SystemExit(
                "Live-Modus braucht KRAKEN_API_KEY und KRAKEN_API_SECRET als Umgebungsvariablen."
            )
        self.cfg = cfg
        self.ex = getattr(ccxt, cfg.exchange)(
            {"apiKey": key, "secret": secret, "enableRateLimit": True}
        )
        self.market = self.ex.load_markets()[cfg.symbol]
        self.base, self.quote = self.market["base"], self.market["quote"]

    def _free(self, currency: str) -> float:
        bal = self.ex.fetch_balance()
        return float(bal.get("free", {}).get(currency) or 0.0)

    def _min_amount(self) -> float:
        return float(self.market["limits"]["amount"]["min"] or 0.0)

    def _settle(self, order: dict) -> dict:
        for _ in range(10):
            if order.get("status") == "closed" and order.get("filled"):
                return order
            time.sleep(2)
            order = self.ex.fetch_order(order["id"], self.cfg.symbol)
        raise RuntimeError(f"Order {order['id']} wurde nicht ausgeführt: {order.get('status')}")

    def _fee_in_quote(self, order: dict) -> float:
        fee = order.get("fee") or {}
        cost = float(fee.get("cost") or 0.0)
        if fee.get("currency") == self.base:
            cost *= float(order.get("average") or order.get("price") or 0.0)
        return cost

    def buy(self, budget_eur: float, price: float) -> tuple[float, float, float] | None:
        spend = min(budget_eur, self._free(self.quote))
        # Reserve für die Gebühr lassen, damit der Topf nicht überzogen wird
        amount = spend * (1 - self.cfg.fee_rate * 1.5) / price
        amount = float(self.ex.amount_to_precision(self.cfg.symbol, amount))
        if amount < self._min_amount():
            print(f"Kauf übersprungen: {amount} {self.base} < Mindestmenge {self._min_amount()}")
            return None
        order = self._settle(self.ex.create_order(self.cfg.symbol, "market", "buy", amount))
        fee = self._fee_in_quote(order)
        filled = float(order["filled"])
        if (order.get("fee") or {}).get("currency") == self.base:
            filled -= float(order["fee"]["cost"])
        return filled, float(order["cost"]) + fee, fee

    def sell(self, btc_amount: float) -> tuple[float, float, float] | None:
        amount = min(btc_amount, self._free(self.base))
        amount = float(self.ex.amount_to_precision(self.cfg.symbol, amount))
        if amount < self._min_amount():
            print(f"Verkauf übersprungen: {amount} {self.base} < Mindestmenge {self._min_amount()}")
            return None
        order = self._settle(self.ex.create_order(self.cfg.symbol, "market", "sell", amount))
        fee = self._fee_in_quote(order)
        return float(order["filled"]), float(order["cost"]) - fee, fee
