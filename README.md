# UNDER PRESSURE

A World Cup soccer analytics platform that decomposes team performance by score-state pressure
using action-level possession value (VAEP).

**Live demo:** _add Vercel URL after deployment_
**API:** _add Render URL after deployment_

**The finding:** across the 2018 and 2022 World Cups, the team with the higher match-level
average VAEP (a possession-value metric scoring every pass, carry, and shot by how much it
changes the probability of scoring and conceding) won **95.0% of decisive, non-drawn matches**
(95 of 100), holding consistently across both tournaments independently (94.1% in 2018, 95.9%
in 2022). The project also computes a secondary, descriptive Pressure Resilience Score (PRS) per
team — how much a team's possession value holds up when behind on the scoreboard — but tested
rigorously as a predictor of tournament survival, it did not outperform FIFA ranking; we report
that honestly rather than overselling it.

## What's in the app

**Home (`/`)** — The landing page. A hero stat, fetched live from `/api/regression`, leads with
the 95% finding ("Not the higher-ranked team. Not the favorite. The team that outplayed them."),
with links into the match browser and methodology page. Below it: a PRS × PPI quadrant scatter
plot (elite / pretenders / grinders / fragile) filterable by tournament (All / 2022 / 2018), and
a full leaderboard. Teams with a small losing-state action sample are flagged with a ⚠ (PRS is
noisier for them), and teams whose PRS looks surprising given their actual tournament result
(e.g. a champion who rarely trailed) get an explicit ⓘ explanation rather than being left to look
like a model error.

**Match Browser (`/matches`)** — Every WC2018 + WC2022 match, filterable by tournament. Click a
match to see both teams' match-average VAEP as bars, with the higher value highlighted — makes
the 95% finding explorable match-by-match instead of just a number on the Methodology page.

**Team Detail (`/team/:teamId`)** — Per-team breakdown: a Pressure Resilience Score card (with
opponent-adjusted PRS and quadrant badge), a pressure curve across the five game states
(winning big → losing big), a group-stage-vs-knockout VAEP retention chart, a match-by-match
tournament timeline, and a data-specific insight callout computed from that team's actual
numbers — e.g. *"Tunisia's VAEP rate in losing states (0.0039) is 25.5× their level-state
baseline (0.0002) — the largest pressure multiplier of any 2018 team."*

**2026 Live (`/live`)** — Preliminary standings for the in-progress 2026 World Cup, pulled from
football-data.org. Since this tournament has no VAEP data (it hasn't happened in the historical
sense), PRS here is a coarse results-based proxy: for each match, compare the half-time score to
the full-time score, and credit a team with every second-half goal scored in matches where they
were behind at half time. The page carries a non-dismissable disclaimer explaining this is not
VAEP-derived and not comparable to the 2018/2022 historical PRS values.

**Methodology (`/methodology`)** — The regression panel (the primary match-VAEP-accuracy finding
plus the secondary PRS-vs-FIFA-rank analysis, both pulled live from `/api/regression`) followed
by the full methodology writeup (data, metric, finding, limitations) rendered from
`docs/methodology.md`.

Flags throughout the app are real images from flagcdn.com rather than emoji, since flag emoji
render unreliably (e.g. as bare two-letter codes) on some platforms.

## How it works

- **Data**: [StatsBomb Open Data](https://github.com/statsbomb/open-data) event data for WC
  2018, WC 2022 (primary), plus Copa América 2024 and EURO 2024 (exploratory validation only).
- **VAEP**: every on-ball action is converted to SPADL format and scored with `socceraction`'s
  VAEP model, fit locally on the action corpus, producing a per-action possession-value rating.
- **PRS**: each team's average VAEP rate while losing is compared against their baseline
  (level-game-state) rate, as a descriptive measure of pressure resilience.
- **Validation**: the primary claim (match-VAEP-accuracy) and the secondary PRS regression are
  both computed in `backend/pipeline/04_run_regression.py` and served at `/api/regression`.
- **Architecture**: all computation happens offline in the numbered pipeline scripts
  (`backend/pipeline/01`–`05`); the FastAPI backend only loads the resulting parquet/JSON files
  into memory at startup and serves them — no pandas, no model inference, and no StatsBomb calls
  at runtime.

## API

| Endpoint | Returns |
|---|---|
| `GET /health` | `{"status": "ok"}` |
| `GET /api/teams` | All 64 historical teams, sorted by PRS |
| `GET /api/team/{team_id}` | Full team detail: pressure curve, match timeline, insight callout |
| `GET /api/matches` | All 128 historical matches (optional `?tournament=2018\|2022` filter) |
| `GET /api/regression` | Primary (match-VAEP-accuracy) and secondary (PRS vs FIFA rank) findings |
| `GET /api/methodology` | The contents of `docs/methodology.md` |
| `GET /api/live/teams` | Live 2026 proxy-PRS standings |
| `GET /api/live/refresh` | Triggers an immediate live-data refresh |

## Run locally

**Backend:**
```
cd backend
python -m venv venv
source venv/Scripts/activate  # or venv/bin/activate on macOS/Linux
pip install -r requirements.txt
ENVIRONMENT=development uvicorn main:app --port 8000
```

To populate the 2026 Live tab, get a free API key from
[football-data.org](https://www.football-data.org/client/register) and set
`FOOTBALL_DATA_API_KEY` in `backend/.env`.

**Frontend:**
```
cd frontend
npm install
npm run dev
```

**Pipeline (re-running from scratch; requires `backend/pipeline/requirements.txt`):**
```
cd backend/pipeline
pip install -r requirements.txt
python 01_load_statsbomb.py
python 02_compute_vaep.py
python 03_engineer_features.py
python 04_run_regression.py
python 05_build_parquets.py
```

## Data attribution

Match and event data courtesy of [StatsBomb](https://statsbomb.com/) Open Data, used under
their open data terms. Live 2026 results via [football-data.org](https://www.football-data.org/).
Possession-value modeling via [`socceraction`](https://github.com/ML-KULeuven/socceraction)'s
VAEP implementation.
