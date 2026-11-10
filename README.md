# cryptocastle 🏰

Ein kleiner Bitcoin-Sparplan-Bot mit Trend-Filter. Er bekommt **5 € pro Monat** und handelt nie mit mehr.

> ⚠️ Keine Finanzberatung. Krypto kann stark fallen – setze nur Geld ein, dessen Verlust du verkraftest.

## Die Strategie

Einmal pro Woche prüft der Bot den Bitcoin-Kurs gegen den Durchschnitt der letzten 200 Tage:

| Situation | Was der Bot tut |
|---|---|
| Kurs **über** dem Durchschnitt (Aufwärtstrend) | Den ganzen Euro-Topf in BTC investieren |
| Kurs bis zu 15 % darunter | Nichts kaufen, Euro ansparen |
| Kurs **mehr als 15 % darunter** (Absturz) | Alle BTC verkaufen und abwarten |

Jeden Monat kommen 5 € in den Euro-Topf. Alle Werte lassen sich in `config.toml` ändern.

## Sicherheit

- **Simulationsmodus als Standard** (`mode = "paper"`): Es wird nichts echt gehandelt.
- **Budget-Grenze:** Der Bot führt sein eigenes Konto (`state/state.json`). Er gibt nie mehr aus, als ihm gutgeschrieben wurde, selbst wenn mehr Geld auf der Börse liegt.
- **Notbremse:** Fällt das Bot-Vermögen unter 50 % der Einzahlungen, hört er auf zu handeln. Zum Fortsetzen in `state/state.json` `"halted": false` setzen.
- **API-Schlüssel ohne Auszahlungsrecht** verwenden (siehe unten).

## Lokal ausprobieren

```bash
pip install -r requirements.txt
python -m pytest -q                              # Tests
python -m cryptocastle.backtest --since 2018-01-01   # Backtest gegen normalen Sparplan
python -m cryptocastle.bot                       # ein Bot-Durchlauf (Simulation)
```

Der Backtest lädt BTC/EUR-Tageskurse von Bitstamp (lange Historie) und speichert sie in `data/`.

## Automatisch laufen lassen (GitHub Actions)

- **Bot** (`.github/workflows/bot.yml`): läuft jeden Montag, speichert `state/state.json` und `trades.csv` zurück ins Repo.
- **Backtest** (`.github/workflows/backtest.yml`): manuell starten unter *Actions → Backtest → Run workflow*. Das Ergebnis steht in der Zusammenfassung des Laufs.
- **Tests**: laufen bei jedem Push.

Geplante Läufe funktionieren nur auf dem Standard-Branch (`main`).

## Auf echtes Geld umstellen

Erst nach ein paar Wochen Simulation!

1. Kraken-Konto anlegen und verifizieren. Einen **Dauerauftrag über 5 €/Monat** per SEPA auf Kraken einrichten.
2. Bei Kraken unter *Settings → API* einen Schlüssel erstellen, nur mit diesen Rechten:
   - ✅ Query Funds
   - ✅ Query Open Orders & Trades / Query Closed Orders & Trades
   - ✅ Create & Modify Orders
   - ❌ **Withdraw Funds – NICHT aktivieren**
3. Im GitHub-Repo unter *Settings → Secrets and variables → Actions* `KRAKEN_API_KEY` und `KRAKEN_API_SECRET` anlegen.
4. `state/state.json` löschen, damit der Bot bei null beginnt (die Simulation hat sonst schon „Geld“ verbucht).
5. In `config.toml` `mode = "live"` setzen.

## Steuern (Deutschland)

`trades.csv` protokolliert jeden Kauf und Verkauf mit Kurs und Gebühr. Gewinne aus Verkäufen innerhalb eines Jahres nach dem Kauf sind steuerpflichtig (Freigrenze 1.000 €/Jahr). Nach über einem Jahr Haltedauer sind sie steuerfrei.

## Später ausbauen

Ab ca. 100–200 € im Topf lohnt sich ein Rebalancing-Modus (z. B. 50 % BTC / 50 % Euro).
