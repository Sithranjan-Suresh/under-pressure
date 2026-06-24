# UNDER PRESSURE — Full Project Context
*Read this entire file before writing a single line of code. Every architectural and design decision references definitions made here.*

---

## What We're Building

**"UNDER PRESSURE"** is a World Cup soccer analytics platform that answers one question with statistical rigor:

> Which national teams maintain — or elevate — their possession value when match pressure is highest, and does that resilience predict knockout survival better than FIFA ranking?

This is not a score predictor. It is not an xG tracker. It is a **pressure decomposition framework**: an original analytical model that separates a team's baseline quality from their ability to sustain that quality under the specific stressors of World Cup football — score deficit, elimination stakes, late match time.

The project is built to win a sports analytics hackathon judged on three criteria: analytical insight, practical application, and data presentation. Every decision — methodological, architectural, visual — is optimized for those three criteria simultaneously.

---

## The Core Model (defined once, referenced everywhere)

### Action Value Framework

The foundation is **VAEP** (Value of Actions by Estimating Probabilities), an action-level possession value metric from `socceraction`. For every on-ball action (pass, carry, shot, dribble, pressure, interception), VAEP computes:

```
VAEP(action) = ΔP(score | action) − ΔP(concede | action)
```

This produces a per-action value in expected goal units. Aggregated per team per game state, it gives a principled measure of how much value a team generates in each pressure context.

### The Decomposition Formula

Every team's VAEP output is decomposed into three additive components:

```
vaep_neutral   = team's mean VAEP rate at game_state = "level", group stage
                 (their true baseline — no score pressure, no elimination stakes)

support_delta  = (vaep_neutral_opponent_avg − vaep_neutral_league_avg)
                 (quality of opposition they faced, normalized to league mean)

pressure_residual = vaep_losing_state − vaep_neutral
                 (the actual change in VAEP when the team is chasing a deficit)
```

**Pressure Resilience Score (PRS)** is derived from `pressure_residual`:

```
raw_PRS = mean(vaep_rate_losing_close, vaep_rate_losing_big) / vaep_rate_level

PRS = (raw_PRS − min_raw_PRS) / (max_raw_PRS − min_raw_PRS) × 100
    → rounded to 1 decimal, range [0, 100] across all qualifying teams
```

A PRS of 100 means this team elevates most under pressure relative to all other teams in the dataset. A PRS of 0 means they collapse most.

### The Novel Regression (the core analytical contribution)

Beyond the scores, we run an original logistic regression using WC 2018 and WC 2022 historical data:

```
knockout_exit ~ PRS + FIFA_rank + stage_retention + peak_performance_index
```

Where `knockout_exit` is a binary outcome (did the team exit in this round?). We report:
- McFadden's pseudo-R² for PRS-only model vs FIFA-rank-only model vs combined
- Odds ratios with 95% confidence intervals for each predictor
- The specific claim: "PRS explains X% of knockout exit variance; FIFA ranking explains Y%"

This regression is the single finding that separates the project from a dashboard and makes it a genuine analytical contribution. It is run once in the pipeline, stored in `regression_results.json`, and surfaced on the Methodology page.

### Opponent-Adjusted PRS

A secondary metric that adjusts PRS for opposition quality:

```
adj_PRS = PRS × (1 + opponent_strength_factor)

opponent_strength_factor = mean(opponent_vaep_neutral) / league_mean_vaep_neutral − 1
```

Teams with high adj_PRS maintained resilience against stronger opposition. Both raw and adjusted PRS are stored and surfaced in the UI.

---

## Five Game States (used everywhere — never redefined)

| Code | Label | Score Differential (team perspective) |
|---|---|---|
| `winning_big` | Winning Big | +2 or more |
| `winning_close` | Winning Close | +1 |
| `level` | Level | 0 |
| `losing_close` | Losing Close | −1 |
| `losing_big` | Losing Big | −2 or less |

Score differential is always from the **acting team's perspective**: their goals minus opponent goals at the moment of the action, not the final score.

---

## Tournament Pressure Scale (used everywhere — never redefined)

| Stage | Pressure Score |
|---|---|
| Group Stage | 1 |
| Round of 16 | 2 |
| Quarter-finals | 3 |
| Semi-finals | 4 |
| Third Place Final | 4 |
| Final | 5 |

---

## Quadrant Classification

Teams are placed in one of four quadrants based on median-split of PRS (x-axis) and Peak Performance Index / PPI (y-axis). PPI = `vaep_rate_level` at group stage, the team's true ceiling.

| Quadrant | PPI | PRS | Meaning |
|---|---|---|---|
| `elite` | ≥ median | ≥ median | High ceiling, holds it under pressure |
| `pretenders` | ≥ median | < median | High ceiling, collapses under pressure |
| `grinders` | < median | ≥ median | Lower ceiling, but resilient — dangerous |
| `fragile` | < median | < median | Low ceiling, collapses — likely early exit |

Medians are recomputed each time the pipeline runs and stored in `model_metadata.json`. They are never hardcoded in the frontend.

---

## Data Sources

### StatsBomb Open Data (primary — free, on GitHub)
- FIFA Men's World Cup 2022: 64 matches, full event data + StatsBomb 360 data
- FIFA Men's World Cup 2018: 64 matches, full event data
- Copa América 2024: 32 matches, full event data (used for cross-tournament validation)
- UEFA EURO 2024: 51 matches, full event data + 360 (used for cross-tournament validation)
- Access: `pip install statsbombpy`, then `from statsbombpy import sb`
- GitHub: https://github.com/statsbomb/open-data

### football-data.org (live 2026 results — free tier)
- WC 2026 match results as they happen
- Endpoint: `https://api.football-data.org/v4/competitions/2000/matches`
- Free API key at football-data.org, takes 2 minutes to register
- Used only for the live 2026 tab — not for the historical model

### FIFA Rankings Archive (for regression)
- Historical FIFA ranking points at tournament start: hand-collected from FIFA.com archives for WC 2018 and WC 2022
- Stored as `backend/data/raw/fifa_rankings_raw.csv`
- Only ~64 rows (32 teams × 2 tournaments) — small enough to collect manually in 30 minutes

---

## Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| Data pipeline | Python 3.11, statsbombpy, socceraction, pandas, scipy, scikit-learn | Best open soccer data toolchain |
| Data storage | Parquet files, pre-computed offline | Zero runtime inference — instant cold starts |
| Backend | FastAPI + Uvicorn | Lightweight, async, Render-compatible |
| Frontend | React + Vite | Fast build, Vercel-native |
| Charts | Recharts | Best React charting library for this use case |
| Deployment (API) | Render free tier | |
| Deployment (UI) | Vercel | |
| Keep-alive | cron-job.org → `/health` every 14 minutes | Prevents Render cold start during demo |

---

## The Inviolable Architecture Rule

> **ALL computation happens in pipeline scripts run locally. The API only reads parquet files into memory at startup and serves them as JSON. No pandas, no model inference, no StatsBomb calls at runtime — ever.**

Pipeline scripts live in `backend/pipeline/` and produce `.parquet` files in `backend/data/`. These parquets are committed to the repo. The FastAPI server loads them once on startup. This is the same pattern that made QB True Value fast and demo-safe.

---

## Project Structure

```
under-pressure/
├── backend/
│   ├── main.py
│   ├── routers/
│   │   ├── teams.py
│   │   ├── matches.py
│   │   ├── live.py
│   │   └── methodology.py
│   ├── data/
│   │   ├── teams_historical.parquet
│   │   ├── pressure_curves.parquet
│   │   ├── matches_historical.parquet
│   │   ├── regression_results.json
│   │   ├── model_metadata.json
│   │   └── live_2026.parquet
│   ├── pipeline/
│   │   ├── 01_load_statsbomb.py
│   │   ├── 02_compute_vaep.py
│   │   ├── 03_engineer_features.py
│   │   ├── 04_run_regression.py
│   │   └── 05_build_parquets.py
│   ├── requirements.txt
│   └── render.yaml
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Home.jsx
│   │   │   ├── TeamDetail.jsx
│   │   │   ├── Live2026.jsx
│   │   │   └── Methodology.jsx
│   │   ├── components/
│   │   │   ├── PressureScatter.jsx
│   │   │   ├── PressureCurve.jsx
│   │   │   ├── StageDropoff.jsx
│   │   │   ├── ResilienceCard.jsx
│   │   │   ├── RegressionPanel.jsx
│   │   │   ├── OpponentAdjustedBadge.jsx
│   │   │   └── TournamentTimeline.jsx
│   │   ├── hooks/
│   │   │   ├── useTeams.js
│   │   │   ├── useTeam.js
│   │   │   └── useMethodology.js
│   │   ├── lib/
│   │   │   └── api.js
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   ├── vite.config.js
│   ├── vercel.json
│   └── package.json
├── docs/
│   └── methodology.md
├── screenshots/
└── README.md
```

---

## API Contract (frontend depends on exactly these shapes — never change field names)

### GET /api/teams
Returns all historical teams sorted by PRS descending.
```json
[
  {
    "team_id": "Argentina_2022",
    "team_name": "Argentina",
    "flag_emoji": "🇦🇷",
    "tournament": "2022",
    "prs": 84.2,
    "adj_prs": 79.1,
    "ppi": 0.0431,
    "stage_retention": 0.94,
    "quadrant": "elite",
    "matches_played": 7,
    "group_vaep_avg": 0.0408,
    "knockout_vaep_avg": 0.0433,
    "reached_final": true,
    "tournament_result": "Winner"
  }
]
```

### GET /api/team/{team_id}
Full detail for one team. `team_id` format: `"Argentina_2022"`.
```json
{
  "team_id": "Argentina_2022",
  "team_name": "Argentina",
  "flag_emoji": "🇦🇷",
  "tournament": "2022",
  "prs": 84.2,
  "prs_rank": 2,
  "adj_prs": 79.1,
  "ppi": 0.0431,
  "ppi_rank": 4,
  "stage_retention": 0.94,
  "quadrant": "elite",
  "matches_played": 7,
  "group_vaep_avg": 0.0408,
  "knockout_vaep_avg": 0.0433,
  "reached_final": true,
  "tournament_result": "Winner",
  "pressure_curve": [
    {"state": "winning_big",   "label": "Winning Big",   "vaep_rate": 0.0389, "action_count": 312},
    {"state": "winning_close", "label": "Winning Close", "vaep_rate": 0.0401, "action_count": 487},
    {"state": "level",         "label": "Level",         "vaep_rate": 0.0431, "action_count": 743},
    {"state": "losing_close",  "label": "Losing Close",  "vaep_rate": 0.0448, "action_count": 298},
    {"state": "losing_big",    "label": "Losing Big",    "vaep_rate": 0.0419, "action_count": 89}
  ],
  "match_timeline": [
    {
      "match_id": 3869685,
      "opponent": "France",
      "stage": "Final",
      "tournament_pressure": 5,
      "result": "W",
      "team_vaep_avg": 0.0441,
      "opponent_vaep_avg": 0.0388
    }
  ]
}
```

### GET /api/matches
All historical matches.
```json
[
  {
    "match_id": 3869685,
    "home_team": "France",
    "away_team": "Argentina",
    "home_team_id": "France_2022",
    "away_team_id": "Argentina_2022",
    "home_score": 2,
    "away_score": 4,
    "stage": "Final",
    "tournament_pressure": 5,
    "home_vaep_avg": 0.0388,
    "away_vaep_avg": 0.0441,
    "tournament": "2022"
  }
]
```

### GET /api/regression
The logistic regression results.
```json
{
  "model_prs_only": {
    "pseudo_r2": 0.231,
    "aic": 87.4,
    "predictor": "PRS",
    "odds_ratio": 0.967,
    "ci_lower": 0.941,
    "ci_upper": 0.994,
    "p_value": 0.012
  },
  "model_fifa_only": {
    "pseudo_r2": 0.089,
    "aic": 104.2,
    "predictor": "FIFA_rank",
    "odds_ratio": 1.018,
    "ci_lower": 1.003,
    "ci_upper": 1.034,
    "p_value": 0.023
  },
  "model_combined": {
    "pseudo_r2": 0.271,
    "aic": 83.1,
    "predictors": ["PRS", "FIFA_rank", "stage_retention", "ppi"],
    "coefficients": {
      "PRS":             {"odds_ratio": 0.962, "ci_lower": 0.934, "ci_upper": 0.991, "p_value": 0.009},
      "FIFA_rank":       {"odds_ratio": 1.011, "ci_lower": 0.994, "ci_upper": 1.028, "p_value": 0.191},
      "stage_retention": {"odds_ratio": 0.041, "ci_lower": 0.003, "ci_upper": 0.621, "p_value": 0.021},
      "ppi":             {"odds_ratio": 0.000, "ci_lower": 0.000, "ci_upper": 0.881, "p_value": 0.044}
    }
  },
  "headline": "PRS explains 23.1% of knockout exit variance vs 8.9% for FIFA ranking alone.",
  "n_team_rounds": 128
}
```

### GET /api/live/teams
Live 2026 teams. Same schema as `/api/teams` but `tournament = "2026"` and some fields may be null if insufficient data.

### GET /api/methodology
Returns the content of `docs/methodology.md` as a JSON string.

### GET /health
```json
{"status": "ok"}
```

---

## Parquet Schemas

### teams_historical.parquet
One row per team-tournament (e.g. Argentina 2022, Argentina 2018 are two separate rows).

| column | type | notes |
|---|---|---|
| team_id | str | format: `"{team_name}_{year}"` |
| team_name | str | StatsBomb display name |
| flag_emoji | str | hardcoded |
| tournament | str | "2018", "2022" |
| prs | float | 0–100 normalized |
| adj_prs | float | opponent-adjusted PRS |
| ppi | float | vaep_rate at level/group stage |
| ppi_rank | int | rank within tournament |
| prs_rank | int | rank within tournament |
| stage_retention | float | knockout_vaep / group_vaep |
| quadrant | str | elite/pretenders/grinders/fragile |
| matches_played | int | |
| group_vaep_avg | float | |
| knockout_vaep_avg | float | |
| reached_final | bool | |
| tournament_result | str | "Winner", "Runner-Up", "Semi-Final", etc. |
| fifa_rank | int | ranking at tournament start |

### pressure_curves.parquet
One row per team-tournament-game_state (5 rows per team).

| column | type |
|---|---|
| team_id | str |
| team_name | str |
| tournament | str |
| state | str |
| label | str |
| vaep_rate | float |
| action_count | int |

### matches_historical.parquet
One row per match.

| column | type |
|---|---|
| match_id | int |
| home_team | str |
| away_team | str |
| home_team_id | str |
| away_team_id | str |
| home_score | int |
| away_score | int |
| stage | str |
| tournament_pressure | int |
| home_vaep_avg | float |
| away_vaep_avg | float |
| tournament | str |

### regression_results.json
See `/api/regression` response shape above. Produced by pipeline script 04, committed to repo, never recomputed at runtime.

### model_metadata.json
```json
{
  "prs_median": 52.3,
  "ppi_median": 0.0389,
  "tournaments_included": ["2018", "2022"],
  "total_teams": 64,
  "total_actions": 412847,
  "pipeline_run_date": "2026-06-23"
}
```

---

## Visual Design System (apply consistently — no deviations)

### Color Tokens
```
--bg-base:        #0A0C10   (page background — deeper than pure black)
--bg-surface:     #13161F   (card / panel background)
--bg-elevated:    #1C2030   (hover states, selected items)
--bg-border:      #252A3A   (dividers, card borders)
--accent:         #00C896   (primary teal — pressure intensity)
--accent-dim:     rgba(0, 200, 150, 0.12)
--accent-border:  rgba(0, 200, 150, 0.35)
--danger:         #F23557   (losing states, collapse)
--danger-dim:     rgba(242, 53, 87, 0.12)
--win:            #36F5A8   (winning states, elevation)
--win-dim:        rgba(54, 245, 168, 0.12)
--neutral:        #F5A623   (level state, pretenders quadrant)
--neutral-dim:    rgba(245, 166, 35, 0.12)
--text-primary:   #EDF0F7
--text-muted:     #6B7280
--text-faint:     #2E3447   (quadrant watermark text)
--elite:          #00C896   (same as accent)
--pretenders:     #F5A623
--grinders:       #36F5A8
--fragile:        #F23557
```

### Typography
```
Display / Headlines:  Space Grotesk — weights 500, 700
Body / Labels:        Inter — weights 400, 500
Stat Numbers:         Space Mono — weight 400
```
All three loaded from Google Fonts in `index.html`.

### Signature Visual Element
The scatter plot renders quadrant labels — `ELITE`, `PRETENDERS`, `GRINDERS`, `FRAGILE` — as large uppercase Space Grotesk text at 8% opacity, positioned in the background of each quadrant. The label IS the legend. A judge understands the framework before reading a single tooltip.

### Chart Conventions
- All chart backgrounds: transparent
- Card wrappers: `--bg-surface`, `1px solid --bg-border`, `border-radius: 10px`
- Grid lines: `--bg-border` at 40% opacity
- Tooltips: `--bg-surface` background, `--accent` left border, `--text-primary` text, `Space Mono` for numbers
- Axis labels: `--text-muted`, `Inter`, 11px
- No chart titles inside charts — use card-level headers above

---

## Flag Emojis (hardcoded — never generated)

```python
FLAG_EMOJIS = {
    # WC 2022
    "Argentina": "🇦🇷", "France": "🇫🇷", "Morocco": "🇲🇦", "Croatia": "🇭🇷",
    "England": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "Netherlands": "🇳🇱", "Brazil": "🇧🇷", "Portugal": "🇵🇹",
    "Spain": "🇪🇸", "Japan": "🇯🇵", "South Korea": "🇰🇷", "Australia": "🇦🇺",
    "Switzerland": "🇨🇭", "Senegal": "🇸🇦", "United States": "🇺🇸", "Poland": "🇵🇱",
    "Denmark": "🇩🇰", "Tunisia": "🇹🇳", "Mexico": "🇲🇽", "Uruguay": "🇺🇾",
    "Ecuador": "🇪🇨", "Ghana": "🇬🇭", "Germany": "🇩🇪", "Costa Rica": "🇨🇷",
    "Serbia": "🇷🇸", "Belgium": "🇧🇪", "Canada": "🇨🇦", "Cameroon": "🇨🇲",
    "Saudi Arabia": "🇸🇦", "Iran": "🇮🇷", "Qatar": "🇶🇦", "Wales": "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
    # WC 2018
    "Russia": "🇷🇺", "Sweden": "🇸🇪", "Colombia": "🇨🇴", "Belgium": "🇧🇪",
    "Panama": "🇵🇦", "Tunisia": "🇹🇳", "Peru": "🇵🇪", "Iceland": "🇮🇸",
    "Nigeria": "🇳🇬", "Costa Rica": "🇨🇷", "Egypt": "🇪🇬",
}
```

---

## Naming Conventions

- `team_id`: always `"{team_name}_{tournament_year}"` — e.g. `"Argentina_2022"`. This is the join key between all parquets and the frontend route param. Never use StatsBomb's internal team ID as a public-facing key.
- All floats in parquets and JSON responses: rounded to 4 decimal places for VAEP rates, 1 decimal place for PRS/adj_PRS, 3 decimal places for regression coefficients and p-values.
- Pipeline scripts numbered `01` through `05` and run strictly in order. Each script's output is the next script's only input from the pipeline (scripts never reach back to earlier raw data).
- `game_state` values: always one of the five exact strings defined in the Five Game States table. Never abbreviated, never translated.

---

## What Not to Build

- ❌ Player-level drill-downs (team level only — the data supports it but scope kills)
- ❌ User accounts or authentication
- ❌ A database — parquet IS the database
- ❌ Live VAEP computation — only pre-computed values at runtime
- ❌ Comparison mode (two teams side by side) — cut for scope
- ❌ `create-react-app` — use Vite
- ❌ `axios` — use native `fetch` wrapped in `lib/api.js`
- ❌ Additional chart libraries beyond Recharts

---

## Definition of Done

The project is complete when all of the following are true:
1. `https://your-app.vercel.app` loads the scatter plot in under 2 seconds
2. Clicking any team navigates to its full detail page with pressure curve, stage dropoff, match timeline, and opponent-adjusted PRS badge
3. The Methodology page states the regression finding — "PRS explains X% of knockout exit variance vs Y% for FIFA ranking" — sourced from `regression_results.json`
4. The Live 2026 tab shows current WC 2026 teams with at least a results-based preliminary ranking and a clear disclaimer about sample size
5. `/health` on the Render URL returns `{"status": "ok"}`
6. The GitHub repo is public with a README whose first paragraph states the thesis and the finding, followed by screenshots
7. The full demo path — URL load → scatter → click Argentina → pressure curve → methodology page → regression finding — can be walked in 90 seconds without touching the keyboard after the initial URL load
