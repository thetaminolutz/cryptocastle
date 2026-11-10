import math
from datetime import date, datetime, timedelta, timezone

import pytest

from cryptocastle.backtest import simulate
from cryptocastle.bot import run
from cryptocastle.config import Config
from cryptocastle.portfolio import Portfolio, months_after
from cryptocastle.strategy import decide, sma

CFG = Config(sma_days=5, min_order_eur=5.0, crash_exit_pct=15.0, fee_pct=0.4)


def test_sma():
    assert sma([1, 2, 3], 5) is None
    assert sma([1, 2, 3, 4, 5, 6], 5) == 4


def test_decide_buy_in_uptrend():
    assert decide(110, 100, eur=5, btc=0, cfg=CFG).action == "buy"


def test_decide_hold_when_pot_too_small():
    assert decide(110, 100, eur=4.99, btc=0, cfg=CFG).action == "hold"


def test_decide_hold_below_average_but_above_crash_line():
    assert decide(90, 100, eur=50, btc=0.1, cfg=CFG).action == "hold"


def test_decide_sell_on_crash():
    assert decide(84, 100, eur=0, btc=0.1, cfg=CFG).action == "sell"
    # ohne BTC gibt es nichts zu verkaufen
    assert decide(84, 100, eur=10, btc=0, cfg=CFG).action == "hold"


def test_months_after():
    assert months_after("2026-11", "2027-02") == ["2026-12", "2027-01", "2027-02"]
    assert months_after("2026-11", "2026-11") == []


def test_monthly_credit_is_idempotent_and_catches_up():
    pf = Portfolio()
    assert pf.credit_monthly("2026-11", 5) == 1
    assert pf.credit_monthly("2026-11", 5) == 0
    assert pf.credit_monthly("2027-01", 5) == 2
    assert pf.eur == pf.deposited_eur == 15


def test_simulated_buy_and_sell_respect_fees():
    pf = Portfolio(eur=10, deposited_eur=10)
    btc, spent, fee = pf.simulate_buy(100, 0.004)
    assert spent == 10 and math.isclose(fee, 0.04)
    assert math.isclose(pf.btc, 9.96 / 100) and pf.eur == 0
    pf.simulate_sell(100, 0.004)
    assert pf.btc == 0 and math.isclose(pf.eur, 9.96 * 0.996)


def test_run_paper_buys_and_logs(tmp_path):
    pf = Portfolio()
    trades = tmp_path / "trades.csv"
    now = datetime(2026, 11, 10, tzinfo=timezone.utc)
    decision, lines = run(CFG, 120.0, [100.0] * 10, pf, now, trades)
    assert decision.action == "buy"
    assert pf.eur == 0 and pf.btc > 0 and pf.deposited_eur == 5
    assert "kauf" in trades.read_text()


def test_run_never_spends_more_than_budget(tmp_path):
    pf = Portfolio()
    now = datetime(2026, 11, 10, tzinfo=timezone.utc)
    for _ in range(4):  # mehrfach im selben Monat ausführen
        run(CFG, 120.0, [100.0] * 10, pf, now, tmp_path / "t.csv")
    assert pf.deposited_eur == 5
    assert pf.btc * 120.0 <= 5


def test_emergency_brake(tmp_path):
    pf = Portfolio(eur=0, btc=1.0, deposited_eur=100, last_credit_month="2026-11")
    now = datetime(2026, 11, 10, tzinfo=timezone.utc)
    decision, _ = run(CFG, 40.0, [30.0] * 10, pf, now, tmp_path / "t.csv")
    assert pf.halted and decision.action == "hold"


class FakeTrader:
    def __init__(self):
        self.calls = []

    def buy(self, budget, price):
        self.calls.append(("buy", budget))
        return budget * 0.99 / price, budget, budget * 0.004

    def sell(self, btc):
        self.calls.append(("sell", btc))
        return btc, btc * 50, 0.1


def test_run_live_uses_trader_with_bot_budget_only(tmp_path):
    pf = Portfolio()
    trader = FakeTrader()
    now = datetime(2026, 11, 10, tzinfo=timezone.utc)
    run(CFG, 120.0, [100.0] * 10, pf, now, tmp_path / "t.csv", trader)
    assert trader.calls == [("buy", 5.0)]
    assert pf.eur == 0 and pf.btc > 0


def test_backtest_synthetic_crash_protects_capital():
    # 1 Jahr Anstieg, dann 1 Jahr Absturz um 80 %
    start = date(2020, 1, 1)
    rows, p = [], 100.0
    for i in range(730):
        p *= 1.003 if i < 365 else 0.9956
        rows.append((start + timedelta(days=i), p))
    cfg = Config(sma_days=50)
    dca, bot = simulate(rows, cfg, start + timedelta(days=60))
    end = rows[-1][1]
    assert dca.pf.deposited_eur == bot.pf.deposited_eur
    assert bot.pf.value(end) > dca.pf.value(end)
    assert bot.trades > 0
