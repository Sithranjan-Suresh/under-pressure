# UNDER PRESSURE — Engineering Specification

This document specifies every component of the system at a level where it can be built without clarifying questions. Read `UNDER_PRESSURE_Full_Context.md` first — it defines data contracts, naming conventions, formulas, and the visual design system that every component here references rather than redefines.

**Companion file:** `UNDER_PRESSURE_Full_Context.md` — product context, API contract, parquet schemas, design system.

**Pipeline scripts are numbered 01–05 and must be run in order.** Each script's output is the next script's primary input. None are imported by the live backend — they are run locally, their output parquets are committed to the repo.

---

## Part 0: Pre-pipeline setup

### 0.1 — Directory scaffold

**Purpose.** Create the full project directory tree and base config files so every subsequent component has a home before any code is written.

**Inputs.** None — this is a manual scaffolding step.

**Outputs.**
- Full directory tree matching the structure defined in `UNDER_PRESSURE_Full_Context.md`
- `backend/requirements.txt` listing: `fastapi`, `uvicorn[standard]`, `pandas`, `pyarrow`, `python-dotenv`, `httpx`, `scipy`, `scikit-learn`, `statsbombpy`, `socceraction`
- `frontend/` initialized with Vite + React template via `npm create vite@latest frontend -- --template react`
- `frontend/package.json` with dependencies added: `recharts`, `react-router-dom`
- `frontend/index.html` with Google Fonts preconnect and stylesheet link for Space Grotesk (weights 500, 700), Inter (weights 400, 500), and Space Mono
- `frontend/src/index.css` containing all CSS custom property tokens from the Visual Design System section of the context file, plus a universal box-sizing reset and a `body` rule setting `background-color: var(--bg-base)`, `color: var(--text-primary)`, and `font-family: var(--font-body)`
- `frontend/src/lib/api.js` with `BASE_URL` reading from `import.meta.env.VITE_API_BASE_URL` with fallback to `http://localhost:8000`, and exported async functions: `fetchTeams()`, `fetchTeam(teamId)`, `fetchMatches()`, `fetchRegression()`, `fetchMethodology()`, `fetchLiveTeams()` — each throwing a descriptive `Error` on non-OK response
- `frontend/.env.local` with `VITE_API_BASE_URL=http://localhost:8000`
- `frontend/.env.production` with `VITE_API_BASE_URL=` as a placeholder to be filled after Render deployment
- `frontend/vercel.json` containing a single rewrite rule routing all paths to `/index.html` for client-side routing
- `backend/.env` with `ENVIRONMENT=development` and `FOOTBALL_DATA_API_KEY=` as placeholder
- `backend/render.yaml` with service type `web`, build command `pip install -r requirements.txt`, start command `uvicorn main:app --host 0.0.0.0 --port $PORT`, and env var placeholders for `ALLOWED_ORIGINS`, `ENVIRONMENT`, `FOOTBALL_DATA_API_KEY`
- `backend/data/raw/fifa_rankings_raw.csv` — hand-collected file, 64 rows. Columns: `team_name` (must match StatsBomb display names exactly), `tournament` (`"2018"` or `"2022"`), `fifa_rank` (integer, the team's FIFA ranking at the start of that tournament), `tournament_result` (one of: `"Winner"`, `"Runner-Up"`, `"Third Place"`, `"Fourth Place"`, `"Quarter-Final"`, `"Round of 16"`, `"Group Stage"`). This file is hand-authored before any pipeline script runs. Source: FIFA.com archives.

**Acceptance criteria.**
- `cd frontend && npm run dev` starts without errors and serves the Vite default page
- `cd backend && pip install -r requirements.txt` completes without conflicts
- `backend/data/raw/fifa_rankings_raw.csv` exists with 64 rows (32 teams × 2 tournaments) and no nulls

---

## Part 1: Data pipeline

### 1.1 — `backend/pipeline/01_load_statsbomb.py`

**Purpose.** Download StatsBomb open data for four tournaments and save raw events and match metadata to disk. The four tournaments are: WC 2022 (competition_id=43, season_id=106), WC 2018 (competition_id=43, season_id=3), Copa América 2024 (competition_id=223, season_id=282), UEFA EURO 2024 (competition_id=55, season_id=282). WC 2022 and WC 2018 are the primary model inputs. Copa América 2024 and EURO 2024 are used in cross-tournament validation (Part 1.3) only and are never mixed into the primary parquets.

**Inputs.**
- No CLI arguments. The four tournament identifiers are hardcoded constants at the top of the script: `TOURNAMENTS = [...]` as a list of dicts with keys `competition_id`, `season_id`, `label`, `role` (either `"primary"` or `"validation"`).
- Live StatsBomb API via `statsbombpy`: `sb.matches()` and `sb.events()`.

**Outputs.** For each tournament, two files written to `backend/pipeline/raw/`:
- `events_{label}.parquet`: all events for all matches concatenated, with additional columns `match_id` (int), `home_team` (str), `away_team` (str), `home_score` (int), `away_score` (int), `competition_stage` (str) stamped onto every row from the match metadata at join time.
- `matches_{label}.parquet`: the raw matches DataFrame from `sb.matches()` with no modifications beyond saving.

**Processing notes.**
- Iterate over every match in `sb.matches()` for the given competition/season. For each match, call `sb.events(match_id=match_id)`, stamp the five columns above, and append to a list. Concatenate the list once at the end — never concatenate inside the loop.
- Wrap each `sb.events()` call in a try/except. On failure, print the match_id and error and continue rather than aborting the entire download.
- Print progress to stdout: `"[{label}] Downloading match {i}/{total}: {match_id}"` for each match.

**Dependencies.** `statsbombpy`, `pandas`, `pyarrow`. These are offline-pipeline-only — `statsbombpy` must not appear in `backend/requirements.txt` for the live service.

**Acceptance criteria.**
- `backend/pipeline/raw/events_wc2022.parquet` exists, loads without error, has more than 400,000 rows, and contains columns `match_id`, `type`, `team`, `location`, `competition_stage`.
- `backend/pipeline/raw/events_wc2018.parquet` exists with similar structure.
- `backend/pipeline/raw/events_copa2024.parquet` and `events_euro2024.parquet` exist.
- No parquet file is empty or missing.
- Running the script a second time overwrites existing files without error.

---

### 1.2 — `backend/pipeline/02_compute_vaep.py`

**Purpose.** Convert StatsBomb events to SPADL (standardized action format) using `socceraction` and compute VAEP values per action for WC 2018 and WC 2022. Also tags every action with its `game_state` and `tournament_pressure` score at the moment the action occurred, computed from the running score at that point in the match — NOT from the final score.

**Inputs.**
- `backend/pipeline/raw/events_wc2022.parquet`
- `backend/pipeline/raw/events_wc2018.parquet`
- `backend/pipeline/raw/matches_wc2022.parquet`
- `backend/pipeline/raw/matches_wc2018.parquet`

**Outputs.**
- `backend/pipeline/raw/vaep_wc2022.parquet`
- `backend/pipeline/raw/vaep_wc2018.parquet`

Each output has one row per SPADL action and columns: all SPADL columns from `socceraction`, plus `vaep_value` (float), `offensive_value` (float), `defensive_value` (float), `match_id` (int), `home_team` (str), `away_team` (str), `competition_stage` (str), `tournament_pressure` (int, 1–5), `game_state` (str, one of the five codes defined in the context file), `score_diff` (int, team's goals minus opponent's goals at moment of action), `team_name` (str, the team whose player performed the action).

**Processing notes.**
- Process one match at a time. For each match:
  1. Filter events to that match_id.
  2. Identify `home_team_id` by finding the `team_id` of the first event where `team` equals the `home_team` string. StatsBomb `team_id` is an integer inside the events DataFrame.
  3. Call `socceraction.spadl.statsbomb.convert_to_actions(events=match_events, home_team_id=home_team_id)`.
  4. Instantiate `socceraction.vaep.VAEP(nb_prev_actions=3)`, call `.load_model()` to load pretrained weights (this downloads weights on first run), then call `.rate(actions)` to get a DataFrame with `vaep_value`, `offensive_value`, `defensive_value`.
  5. Build a running score timeline from goal events in the match. A goal event is any event where `type == "Shot"` and `shot_outcome == "Goal"`. Sort goals by `(period, minute, second)`. For each action, determine how many goals home and away teams had scored before this action's `(period, minute, second)`. Compute `score_diff` from the acting team's perspective.
  6. Apply the five-state `game_state` classification using `score_diff` per the definitions in the context file.
  7. Apply `tournament_pressure` from the `competition_stage` field using the Tournament Pressure Scale in the context file.
  8. Stamp `match_id`, `home_team`, `away_team`, `competition_stage`, `team_name` onto the actions DataFrame. `team_name` is derived from the `team_id` column in the SPADL actions output: map it back to the team string using the match metadata.
- Wrap the entire per-match block in a try/except. On error, print match_id and exception and continue.
- At the end of each tournament, concatenate all match action DataFrames and save. Do not save per-match files.

**Critical correctness requirement.** The running score at the time of an action must use only goals scored before that action's timestamp, not the final score and not goals at the same timestamp. An action that occurs at minute 65 must see only goals scored before minute 65. If a goal and the action both occur at the same `(period, minute, second)`, treat the goal as occurring after the action for that timestamp. This avoids erroneously tagging actions taken before a goal as "winning" because of a goal scored in the same second.

**Acceptance criteria.**
- Both output parquets exist and have more than 300,000 rows combined.
- Column `game_state` contains only values from the allowed set of five strings. No nulls.
- Column `tournament_pressure` contains only integers 1–5. No nulls.
- Column `vaep_value` has no nulls and a mean between −0.01 and 0.01 (VAEP values are small and roughly zero-mean across all actions).
- Spot-check: for Argentina's Final match in WC 2022, the actions tagged `losing_close` should include actions from the period when France led 2–1 before Mbappe's equalizer.

---

### 1.3 — `backend/pipeline/03_engineer_features.py`

**Purpose.** Aggregate VAEP action-level data into team-season-level features. Also compute cross-tournament validation metrics using Copa América 2024 and EURO 2024 VAEP computed ad-hoc in this script. Produce a single flat DataFrame ready for regression and final parquet building.

**Inputs.**
- `backend/pipeline/raw/vaep_wc2022.parquet`
- `backend/pipeline/raw/vaep_wc2018.parquet`
- `backend/pipeline/raw/events_copa2024.parquet`
- `backend/pipeline/raw/events_euro2024.parquet`
- `backend/pipeline/raw/matches_copa2024.parquet`
- `backend/pipeline/raw/matches_euro2024.parquet`
- `backend/data/raw/fifa_rankings_raw.csv`

**Outputs.**
- `backend/pipeline/processed/team_features.parquet`: one row per team-tournament with all engineered features. This is the direct input to both the regression script (1.4) and the parquet builder (1.5).

**Columns produced in `team_features.parquet`:**

| column | derivation |
|---|---|
| `team_id` | `f"{team_name}_{tournament_year}"` |
| `team_name` | from StatsBomb |
| `tournament` | `"2018"` or `"2022"` |
| `flag_emoji` | looked up from `FLAG_EMOJIS` dict in context file |
| `fifa_rank` | joined from `fifa_rankings_raw.csv` on `(team_name, tournament)` |
| `tournament_result` | joined from `fifa_rankings_raw.csv` |
| `reached_final` | bool, True if `tournament_result` in `["Winner", "Runner-Up"]` |
| `matches_played` | count of distinct `match_id` values for this team |
| `vaep_rate_level` | mean `vaep_value` where `game_state == "level"` |
| `vaep_rate_winning_close` | mean `vaep_value` where `game_state == "winning_close"` |
| `vaep_rate_winning_big` | mean `vaep_value` where `game_state == "winning_big"` |
| `vaep_rate_losing_close` | mean `vaep_value` where `game_state == "losing_close"` |
| `vaep_rate_losing_big` | mean `vaep_value` where `game_state == "losing_big"` |
| `action_count_{state}` | count of actions for each of the five states |
| `group_vaep_avg` | mean `vaep_value` where `tournament_pressure == 1` |
| `knockout_vaep_avg` | mean `vaep_value` where `tournament_pressure >= 2` |
| `stage_retention` | `knockout_vaep_avg / group_vaep_avg` — null if team never played a knockout match |
| `ppi` | same as `vaep_rate_level` (Peak Performance Index, renamed for API) |
| `raw_prs` | `mean(vaep_rate_losing_close, vaep_rate_losing_big) / vaep_rate_level` — null if denominator is zero or fewer than 10 actions in losing states |
| `mean_opponent_ppi` | for each match this team played, the opponent's `ppi` — averaged across all matches |
| `opponent_strength_factor` | `mean_opponent_ppi / league_mean_ppi − 1` where `league_mean_ppi` is the mean `ppi` across all teams in this tournament |

**Minimum sample size rule.** A team-game_state VAEP rate is only computed if there are at least 15 actions in that state. If fewer than 15, the rate is set to null. Teams with null `vaep_rate_level` or null `raw_prs` are retained in the output but flagged with a boolean column `sufficient_data = False`. These teams appear in the frontend with greyed-out PRS values and an `"Insufficient data"` label.

**Cross-tournament validation.** For Copa América 2024 and EURO 2024, run the same VAEP computation inline (calling socceraction the same way as script 1.2, but not saving intermediate parquets). Compute `ppi` and `raw_prs` for those teams. Write results to `backend/pipeline/processed/validation_features.parquet`. This is used only by the methodology page to say "teams with high PRS in 2022 WC tended to also show high PRS in subsequent tournaments" — it is exploratory, not part of the primary model.

**Acceptance criteria.**
- `team_features.parquet` has exactly 64 rows (32 per tournament) with no duplicate `team_id` values.
- `sufficient_data` is True for at least 28 of 32 teams per tournament (some teams play few minutes in losing states — group stage exits in particular).
- Spot-check: Argentina 2022's `vaep_rate_losing_close` must be higher than their `vaep_rate_level` (they consistently elevated under pressure — this is a known finding).
- Morocco 2022's `raw_prs` must rank in the top 10 (they were the 2022 tournament's biggest resilience story).
- `validation_features.parquet` exists with at least 48 rows.

---

### 1.4 — `backend/pipeline/04_run_regression.py`

**Purpose.** Run the logistic regression that is the project's core analytical contribution. Predict knockout-round exit from PRS, FIFA rank, stage retention, and PPI. Compare PRS-only model against FIFA-rank-only model. Save all results to `backend/data/regression_results.json`.

**Inputs.**
- `backend/pipeline/processed/team_features.parquet`

**Outputs.**
- `backend/data/regression_results.json` — matches the `/api/regression` response shape defined in the context file exactly.

**Methodology.**

The unit of observation is a **team-round**: one row per team per knockout round they played. This means a team that reached the Final contributes four rows (Round of 16, Quarter-Final, Semi-Final, Final). A team that exited in the group stage contributes zero rows. This gives `n ≈ 128` observations across WC 2018 + 2022.

The binary outcome `knockout_exit` is 1 if the team was eliminated in that round and 0 if they advanced.

Four logistic regression models are fit using `sklearn.linear_model.LogisticRegression` with no regularization (`C=1e9`, `solver="lbfgs"`, `max_iter=1000`):
1. PRS only
2. FIFA rank only
3. PRS + FIFA rank + stage_retention + ppi (combined)
4. adj_PRS only (adj_PRS = prs × (1 + opponent_strength_factor))

For each model, compute:
- McFadden's pseudo-R² = `1 − (log_likelihood_model / log_likelihood_null)`. Null log-likelihood uses only an intercept.
- AIC = `−2 × log_likelihood + 2 × k` where k is number of parameters including intercept.
- For each predictor: odds ratio = `exp(coefficient)`, 95% CI using `scipy.stats.norm.ppf` applied to standard errors from the Hessian (or bootstrap with 1000 samples if Hessian is unstable — check `np.linalg.cond` of the Hessian matrix; if condition number > 1e10, use bootstrap).
- p-value for each predictor using Wald test: `z = coef / se`, `p = 2 × (1 − scipy.stats.norm.cdf(abs(z)))`.

**Headline string.** Compute and store a `headline` string of the form: `"PRS explains {prs_r2:.1%} of knockout exit variance vs {fifa_r2:.1%} for FIFA ranking alone."` Values derived from pseudo-R² of models 1 and 2 respectively.

**Feature scaling.** Standardize all predictors (zero mean, unit variance) before fitting so that odds ratios are comparable across predictors. Store the means and standard deviations used for scaling in `model_metadata.json` so the frontend can display "per-SD" interpretations if needed.

**Acceptance criteria.**
- `regression_results.json` exists, is valid JSON, and matches the schema in the context file.
- `model_prs_only.pseudo_r2` is greater than `model_fifa_only.pseudo_r2` — this is the core empirical claim and must be true for the project to make its argument. If it is not true, do not fabricate results; instead write an honest finding to the headline field and flag it. Re-examine feature engineering before concluding the model is wrong.
- All p-values are floats between 0 and 1.
- `n_team_rounds` field is between 100 and 140 (the plausible range for WC 2018 + 2022 knockout rounds combined).
- Running the script a second time overwrites the JSON cleanly without appending.

---

### 1.5 — `backend/pipeline/05_build_parquets.py`

**Purpose.** Produce the final parquet files that the API will serve. Normalize PRS to 0–100, classify quadrants, join all features, and write final clean DataFrames to `backend/data/`.

**Inputs.**
- `backend/pipeline/processed/team_features.parquet`
- `backend/pipeline/raw/matches_wc2022.parquet`
- `backend/pipeline/raw/matches_wc2018.parquet`
- `backend/pipeline/raw/vaep_wc2022.parquet`
- `backend/pipeline/raw/vaep_wc2018.parquet`

**Outputs.**
- `backend/data/teams_historical.parquet` — matches schema in context file
- `backend/data/pressure_curves.parquet` — matches schema in context file
- `backend/data/matches_historical.parquet` — matches schema in context file
- `backend/data/model_metadata.json` — matches schema in context file

**PRS normalization.** PRS is normalized across all teams in both tournaments together, not per-tournament separately. This means a WC 2018 team and a WC 2022 team are directly comparable on the 0–100 scale. The formula: `PRS = (raw_PRS − min_raw_PRS) / (max_raw_PRS − min_raw_PRS) × 100`. Only teams with `sufficient_data = True` participate in the min/max calculation. Teams with `sufficient_data = False` get `PRS = null`.

**Opponent-adjusted PRS.** `adj_PRS = raw_PRS × (1 + opponent_strength_factor)`, then normalized 0–100 using the same min/max approach as raw PRS.

**Quadrant classification.** Medians computed across all teams with `sufficient_data = True` in both tournaments combined. Classification rules per context file. Stored medians go into `model_metadata.json` as `prs_median` and `ppi_median`.

**Pressure curves parquet.** Explode the five VAEP-rate columns per team into long format: one row per `(team_id, state)`. Add `label` and `action_count` columns.

**Matches parquet.** For each match, join the per-match VAEP averages from the VAEP parquets: `home_vaep_avg` = mean `vaep_value` for home team's actions in that match, `away_vaep_avg` = same for away team. Add `home_team_id` and `away_team_id` in `"{team_name}_{tournament_year}"` format.

**Match timeline construction.** For each team, produce a JSON-serializable list of their matches in order: `match_id`, `opponent`, `stage`, `tournament_pressure`, `result` (W/D/L from this team's perspective), `team_vaep_avg`, `opponent_vaep_avg`. Store this as a JSON string column `match_timeline_json` in `teams_historical.parquet`. The API router deserializes it when building the `/api/team/{team_id}` response.

**Tournament result join.** Join `tournament_result` and `reached_final` from `fifa_rankings_raw.csv` onto the teams DataFrame. Teams that appear in the VAEP data but not in `fifa_rankings_raw.csv` are an error — print a warning listing them so the hand-collected CSV can be fixed.

**Rounding.** Round all float columns: `prs`, `adj_prs` to 1 decimal place; `ppi`, `group_vaep_avg`, `knockout_vaep_avg`, `vaep_rate_{state}`, `stage_retention` to 4 decimal places. Rank columns (`prs_rank`, `ppi_rank`) are integers.

**Acceptance criteria.**
- `teams_historical.parquet` has 64 rows, no duplicate `team_id` values, and no nulls in `team_name`, `tournament`, `flag_emoji`, `quadrant`.
- `pressure_curves.parquet` has exactly 320 rows (64 teams × 5 states).
- `matches_historical.parquet` has 128 rows (64 per tournament).
- `model_metadata.json` is valid JSON with `prs_median`, `ppi_median`, `total_teams`, `total_actions`, `pipeline_run_date`.
- Running `python 05_build_parquets.py` and then printing the teams sorted by PRS shows Morocco 2022 in the top 12 and Argentina 2022 in the top 5. Print this leaderboard to stdout at the end of the script for visual sanity checking.

---

## Part 2: Backend API

### 2.1 — `backend/main.py`

**Purpose.** FastAPI application entry point. Loads all parquets and JSON artifacts into memory at startup via a `lifespan` context manager. Registers all routers. Configures CORS. Provides `/health` endpoint. Starts a background async task for live 2026 data refresh.

**Inputs.**
- All files in `backend/data/` (parquets + JSON).
- Environment variables: `ALLOWED_ORIGINS` (comma-separated list of allowed CORS origins), `FOOTBALL_DATA_API_KEY`, `ENVIRONMENT`.

**Outputs.**
- A running FastAPI app accessible at port defined by `$PORT` environment variable (required by Render).
- `app_state` dict available to all routers containing: `"teams"` (DataFrame), `"curves"` (DataFrame), `"matches"` (DataFrame), `"regression"` (dict), `"metadata"` (dict), `"live"` (DataFrame, may be empty), `"methodology"` (str).

**Processing notes.**
- Use `@asynccontextmanager` lifespan pattern (not deprecated `on_event`).
- In the lifespan startup, read `regression_results.json` and `model_metadata.json` as Python dicts using `json.load()`. Read `docs/methodology.md` as a raw string. Read all parquets via `pd.read_parquet()`. Store everything in `app_state`.
- After loading, spawn the live refresh background task via `asyncio.create_task(refresh_live_data())`.
- CORS: `allow_origins` reads from `ALLOWED_ORIGINS` environment variable split by comma. During development (when `ENVIRONMENT == "development"`), add `"http://localhost:5173"` unconditionally.
- Include routers with prefix `/api`: `teams`, `matches`, `live`, `methodology`.
- `/health` endpoint returns `{"status": "ok"}` synchronously with no data access.

**Acceptance criteria.**
- Server starts in under 3 seconds on a standard laptop with all parquets present.
- `GET /health` returns 200 with `{"status": "ok"}`.
- Starting the server with a missing parquet file prints a clear error message and exits with non-zero code rather than starting a broken server.

---

### 2.2 — `backend/routers/teams.py`

**Purpose.** Serve team list and individual team detail endpoints.

**Inputs.** Reads from `app_state["teams"]` and `app_state["curves"]`.

**Outputs.**
- `GET /api/teams`: returns list of team objects sorted by `prs` descending, matching the `/api/teams` schema in the context file. Null `prs` values sort to the bottom.
- `GET /api/team/{team_id}`: returns full team detail including `pressure_curve` list and `match_timeline` list, matching the `/api/team/{team_id}` schema in the context file.

**Processing notes.**
- A helper function `safe_float(val)` returns `None` (serialized as JSON `null`) for `None`, `float("nan")`, and `numpy.nan`. Use this for every float field before building response dicts.
- For `GET /api/team/{team_id}`: first try exact match on `team_id` column. If no match, try case-insensitive match. If still no match, raise `HTTPException(status_code=404)` with detail `f"Team '{team_id}' not found. Available IDs include: {sample}"` where `sample` is the first 5 `team_id` values in the DataFrame, to help diagnose encoding issues.
- `pressure_curve` list: filter `app_state["curves"]` to the team, then build the list in the canonical state order defined in the context file. If a state has no row in the curves DataFrame (can happen for teams with `sufficient_data = False` for that state), include the state entry with `vaep_rate: null` and `action_count: 0`.
- `match_timeline` list: deserialize `match_timeline_json` column using `json.loads()`.

**Acceptance criteria.**
- `GET /api/teams` returns 64 items with Argentina 2022 ranked in the top 5 by PRS.
- `GET /api/team/Argentina_2022` returns a response whose `pressure_curve` has exactly 5 items in the canonical state order.
- `GET /api/team/does_not_exist` returns 404 with a helpful message.
- All float fields in responses are either a number or null — never `NaN` (which is not valid JSON).

---

### 2.3 — `backend/routers/matches.py`

**Purpose.** Serve historical match data.

**Inputs.** Reads from `app_state["matches"]`.

**Outputs.**
- `GET /api/matches`: returns list of all 128 historical matches sorted by `tournament` then `tournament_pressure` then `match_id`, matching the `/api/matches` schema in the context file.
- `GET /api/matches?tournament=2022`: optional query parameter filtering to a single tournament. If the parameter is present but not `"2018"` or `"2022"`, return an empty list (not a 400 error).

**Acceptance criteria.**
- Returns 128 items with no query params.
- Returns 64 items with `?tournament=2022`.
- Every item has non-null `match_id`, `home_team`, `away_team`, `stage`.

---

### 2.4 — `backend/routers/live.py`

**Purpose.** Serve live WC 2026 preliminary team data and expose a manual refresh endpoint.

**Inputs.** Reads from `app_state["live"]`. Calls football-data.org API in the background refresh task defined in `main.py`.

**Outputs.**
- `GET /api/live/teams`: returns list of 2026 teams with preliminary PRS. Same shape as `/api/teams` but `tournament = "2026"` and many fields may be null. If `app_state["live"]` is empty, returns empty list.
- `GET /api/live/refresh`: triggers an immediate refresh of live data outside the 30-minute schedule. Returns `{"status": "refreshing", "message": "Live data refresh started"}`. The actual refresh is async — this endpoint returns immediately without waiting.

**Live data refresh logic** (implemented in `main.py` as `async def refresh_live_data()`, called here by reference):
- Calls football-data.org `/v4/competitions/2000/matches` with the API key from environment variable.
- Filters to matches with status `"FINISHED"`.
- For each finished match, extracts home team, away team, and full-time score.
- Computes a **proxy PRS** from score-state events: for each team, counts the number of goals they scored while trailing (i.e., at the moment the goal was scored, their score was less than the opponent's). This is a rough proxy for pressure performance using only result data, not event data.
- Normalizes proxy PRS to 0–100 across all teams in the 2026 data.
- Maps team names to flag emojis using the hardcoded `FLAG_EMOJIS` dict.
- Writes the result to `backend/data/live_2026.parquet` and updates `app_state["live"]`.
- The UI must display a clear disclaimer that 2026 PRS is a results-based proxy, not VAEP-derived.
- Refresh runs on a 30-minute async loop. The first run fires 10 seconds after startup (not immediately, to let the server finish initializing).

**Acceptance criteria.**
- `GET /api/live/teams` returns 200 with an empty list when no live data has been fetched yet.
- `GET /api/live/refresh` returns 200 immediately without blocking.
- After the refresh task runs with a valid API key, `GET /api/live/teams` returns a non-empty list with WC 2026 teams.
- Server logs show `"[LIVE] Refreshed: N teams"` after each successful refresh cycle.

---

### 2.5 — `backend/routers/methodology.py`

**Purpose.** Serve the methodology markdown content.

**Inputs.** Reads from `app_state["methodology"]` (the string content of `docs/methodology.md`).

**Outputs.**
- `GET /api/methodology`: returns `{"content": "<raw markdown string>"}`.

**Acceptance criteria.**
- Returns 200 with a non-empty `content` string.
- If `docs/methodology.md` was not loaded (e.g., file missing at startup), returns 503 with `{"detail": "Methodology content not available"}` rather than a 500.

---

## Part 3: Frontend pages and components

### 3.1 — App shell: `frontend/src/App.jsx`, `frontend/src/main.jsx`

**Purpose.** Root app component with routing and persistent top navigation bar.

**Inputs.** None.

**Outputs.**
- Four `react-router-dom` routes: `/` → `Home`, `/team/:teamId` → `TeamDetail`, `/live` → `Live2026`, `/methodology` → `Methodology`.
- Persistent top nav with: project name/logo (links to `/`), nav links for "2022 Analysis" (`/`), "2026 Live" (`/live`), "Methodology" (`/methodology`). Active link highlighted with bottom border in `--accent` color.
- Nav is sticky, `z-index: 100`, `background: var(--bg-surface)`, `border-bottom: 1px solid var(--bg-border)`.
- Font imports from Google Fonts confirmed present in `index.html`.

**Acceptance criteria.**
- All four routes navigate without 404 in both dev and production.
- Hard-refreshing directly on `/team/Argentina_2022` on the deployed Vercel URL works (requires `vercel.json` rewrite rule — test this explicitly on the deployed build, not just local dev).
- Active nav link is visually distinct from inactive links.

---

### 3.2 — `frontend/src/hooks/useTeams.js`, `useTeam.js`, `useMethodology.js`

**Purpose.** Data fetching hooks for the three primary data shapes. All hooks follow the same pattern: `{ data, loading, error }`.

**Inputs.**
- `useTeams()`: calls `fetchTeams()` on mount. No parameters.
- `useTeam(teamId)`: calls `fetchTeam(teamId)` when `teamId` changes. Refetches on `teamId` change.
- `useMethodology()`: calls `fetchMethodology()` on mount. No parameters.

**Outputs.** Each hook returns `{ data, loading, error }` where `data` is null until the fetch resolves, `loading` is true while in-flight, and `error` is the thrown Error object or null.

**Acceptance criteria.**
- `useTeam` correctly refetches when `teamId` changes (e.g., navigating from one team detail page to another without going back to Home).
- No fetch is made if `teamId` is null or undefined.
- Errors from `lib/api.js` are caught and surfaced in the `error` field — never unhandled.

---

### 3.3 — `frontend/src/components/PressureScatter.jsx`

**Purpose.** The hero scatter plot — the most important visual in the product. Renders all teams on a PRS (x) × PPI (y) canvas with quadrant watermarks and interactive team selection.

**Inputs (props).**
- `teams`: array of team objects from `/api/teams`
- `onTeamClick(team)`: callback fired when a dot or label is clicked
- `prsMedian`: float, the median PRS value (for reference lines)
- `ppiMedian`: float, the median PPI value (for reference lines)
- `selectedTeamId`: string or null, highlights the selected team dot

**Outputs.** A Recharts `ScatterChart` rendered inside a `ResponsiveContainer`.

**Visual requirements.**
- Each team is a circle dot colored by quadrant: `--elite` (teal), `--pretenders` (amber), `--grinders` (green), `--fragile` (red/pink).
- Each dot has the flag emoji as a label rendered above it in 11px Inter.
- Quadrant watermark labels — ELITE, PRETENDERS, GRINDERS, FRAGILE — rendered as four absolutely-positioned `div` elements behind the chart at 8% opacity in Space Grotesk 700. They are children of the chart wrapper div, not SVG elements.
- Two `ReferenceLine` elements: one vertical at `x = prsMedian`, one horizontal at `y = ppiMedian`. Both styled with `--bg-border` color and `strokeDasharray="4 4"`.
- When `selectedTeamId` is non-null, the matching dot renders at radius 10 (up from default 7) with a white ring: `stroke: white, strokeWidth: 2`.
- Tooltip shows team name, flag, PRS, adj_PRS, PPI, and quadrant label.
- Clicking a dot calls `onTeamClick` with the team object.

**Acceptance criteria.**
- All 64 teams render as dots without overlapping labels causing layout breaks.
- Quadrant watermarks are visible but do not obscure data dots.
- Clicking Argentina's dot fires `onTeamClick` with the Argentina team object.
- On teams with `prs: null` (insufficient data), the dot renders in `--text-faint` color and clicking it still works.

---

### 3.4 — `frontend/src/components/PressureCurve.jsx`

**Purpose.** Line chart showing a team's VAEP rate across the five game states, left to right: Winning Big → Winning Close → Level → Losing Close → Losing Big.

**Inputs (props).**
- `curve`: array of 5 objects from `pressure_curve` field of `/api/team/{team_id}` response

**Visual requirements.**
- Line color: `--accent` (teal). Stroke width 2.5.
- Each point rendered as a colored circle: green for winning states, amber for level, red/pink for losing states.
- X-axis labels: the `label` field of each state object ("Winning Big", etc.) in 11px Inter.
- Y-axis: VAEP rate formatted to 4 decimal places.
- A horizontal `ReferenceLine` at `y = curve[2].vaep_rate` (the Level value) with a dashed style and "Baseline" label — this makes it visually obvious whether the team rises above or falls below their neutral-state performance in each pressure context.
- If `vaep_rate` is null for a state, render a gap in the line (do not connect null points) and show a "—" label at that x position.
- Below the chart, a single-sentence interpretation: "This team's VAEP rate [rises / falls / holds steady] when losing." Determined by comparing `vaep_rate_losing_close` to `vaep_rate_level`.

**Acceptance criteria.**
- Line renders with 5 points for Argentina 2022.
- The reference line at the Level value is visually distinct from the main line.
- Null points do not crash the component or render as zero — they create a gap.

---

### 3.5 — `frontend/src/components/StageDropoff.jsx`

**Purpose.** Horizontal bar comparison showing group stage VAEP vs knockout VAEP with an explicit retention percentage.

**Inputs (props).**
- `groupVaep`: float
- `knockoutVaep`: float or null (teams eliminated in group stage have no knockout data)

**Visual requirements.**
- Two horizontal bars: "Group Stage" in `--neutral` color, "Knockouts" in `--win` if `knockoutVaep >= groupVaep` else `--danger`.
- Each bar labeled with the VAEP value to 4 decimal places.
- Below the bars: "Stage Retention: X%" in large Space Mono text, colored `--win` if ≥ 95%, `--neutral` if 80–95%, `--danger` if < 80%.
- If `knockoutVaep` is null, show a message: "This team was eliminated in the group stage" instead of the bar chart.

**Acceptance criteria.**
- Argentina 2022 shows a retention value close to or above 100% (they played better in knockouts).
- Qatar 2022 shows "eliminated in group stage" message.
- Retention percentage is correctly computed as `(knockoutVaep / groupVaep) × 100`.

---

### 3.6 — `frontend/src/components/ResilienceCard.jsx`

**Purpose.** Headline metric card showing PRS, adj_PRS, rank, and quadrant badge.

**Inputs (props).**
- `prs`: float, the 0–100 PRS value
- `adjPrs`: float, opponent-adjusted PRS
- `prsRank`: int
- `totalTeams`: int
- `quadrant`: string

**Visual requirements.**
- The PRS number rendered in Space Mono at approximately 5rem, colored by quadrant.
- Below the number: "Pressure Resilience Score" label in 0.75rem Space Grotesk uppercase.
- Rank line: "Ranked #N of 64 teams" in 0.85rem Inter muted.
- Quadrant badge: small pill with quadrant name, colored background at 15% opacity with matching border.
- Opponent-adjusted PRS shown as a secondary line: "Opponent-adjusted: X.X" in muted text. A tooltip or inline explanation: "Adjusted for strength of opposition faced." Visible but clearly secondary to the main PRS.

**Acceptance criteria.**
- PRS, adj_PRS, rank, and quadrant badge all render without null errors for Argentina 2022.
- Teams with `prs: null` show `"—"` in place of the number and `"Insufficient data"` for the rank line.

---

### 3.7 — `frontend/src/components/RegressionPanel.jsx`

**Purpose.** Display the logistic regression results in a format a non-technical judge can understand and a technical judge will find rigorous.

**Inputs (props).**
- `regression`: object from `/api/regression`

**Visual requirements.**
- Headline sentence at the top in large text: the `headline` field from the regression response. This is the single most important finding in the project and should be the most visually prominent element on the Methodology page.
- Two comparison cards side by side: "PRS Model" vs "FIFA Ranking Model". Each card shows: pseudo-R², AIC. The PRS card highlighted with `--accent-border` to indicate it's the better model.
- Combined model coefficient table: one row per predictor. Columns: Predictor, Odds Ratio, 95% CI, P-value. P-values < 0.05 rendered in `--win` color; ≥ 0.05 in `--text-muted`. The table is scrollable on mobile.
- A plain-language interpretation below the table: "An odds ratio < 1 for PRS means teams with higher resilience scores are less likely to be eliminated in each knockout round." One sentence — written for a non-technical reader.

**Acceptance criteria.**
- Headline renders with actual numbers, not placeholder text.
- Both model cards show their respective pseudo-R² values.
- Coefficient table renders for the combined model with the four predictors.
- If `regression` prop is null (API error), renders a fallback message rather than crashing.

---

### 3.8 — `frontend/src/components/TournamentTimeline.jsx`

**Purpose.** Show a team's match-by-match journey through the tournament as a visual timeline, with per-match VAEP comparison against the opponent.

**Inputs (props).**
- `timeline`: array of match objects from the `match_timeline` field of `/api/team/{team_id}`
- `teamName`: string

**Visual requirements.**
- Horizontal timeline. Each match is a node with: opponent flag emoji + name, stage label, result badge (W/D/L), VAEP comparison bar (this team's VAEP vs opponent's VAEP for that match, as two small horizontal bars).
- Match nodes connected by a horizontal line.
- Result badge: W in `--win` background, D in `--neutral` background, L in `--danger` background.
- Tournament pressure shown as a vertical intensity indicator behind the node: matches with pressure score 4–5 have a faint `--danger` glow to signal elimination stakes.
- On mobile (viewport < 768px), timeline stacks vertically.

**Acceptance criteria.**
- Argentina 2022's timeline shows 7 matches from group stage through final.
- Each match's VAEP comparison clearly shows whether Argentina out-generated their opponent that match.
- Timeline is scrollable horizontally on screens where it doesn't fit.

---

### 3.9 — `frontend/src/pages/Home.jsx`

**Purpose.** The landing page. Hero scatter plot, contextual description, tournament filter, team leaderboard.

**Inputs.** `useTeams()` hook.

**Outputs.**
- Hero section: headline "Who holds their game under pressure?" with `--accent` color on the word "pressure". Two-sentence description of the model.
- Tournament filter tabs: "All", "2022", "2018". Filter applies to both the scatter and the leaderboard simultaneously. Default: "All".
- Scatter plot (PressureScatter component). On dot click, navigate to `/team/{team_id}`.
- Quadrant legend below scatter: four colored dots with quadrant names and one-line definitions.
- Leaderboard below scatter: ranked cards sorted by PRS. Each card: rank number, flag emoji, team name, tournament year, PRS in quadrant color, quadrant badge. Click navigates to team detail.
- Loading state: skeleton placeholder cards (use CSS `background: linear-gradient(90deg, --bg-surface 25%, --bg-elevated 50%, --bg-surface 75%)` animated shimmer) while data loads.
- Error state: clear message with a "Retry" button that calls `window.location.reload()`.

**Acceptance criteria.**
- Scatter and leaderboard both update when switching tournament filter tabs.
- Leaderboard shows 64 teams when "All" is selected, 32 when a specific tournament is selected.
- Loading skeleton is visible for at least 100ms (do not flash on fast connections — add `setTimeout(setLoading, 300)` debounce on very fast responses).
- Navigating from Home to a team detail page and pressing the browser back button returns to Home with the same filter state still selected.

---

### 3.10 — `frontend/src/pages/TeamDetail.jsx`

**Purpose.** Full detail view for one team. Shows all metrics, pressure curve, stage dropoff, match timeline, and an opponent-adjusted PRS badge.

**Inputs.** `teamId` from URL param via `useParams()`. `useTeam(teamId)` hook.

**Outputs.**
- Back link to Home (with left arrow, styled in `--text-muted`).
- Team header: large flag emoji, team name in Space Grotesk 700, tournament year badge, matches played.
- Three-column metric grid on desktop, single column on mobile:
  - Column 1: ResilienceCard (PRS, adj_PRS, rank, quadrant)
  - Column 2: PressureCurve with heading "Pressure Profile"
  - Column 3: StageDropoff with heading "Stage Retention"
- Full-width TournamentTimeline below the grid.
- Insight callout box at the bottom: `--accent-dim` background, `--accent-border` border. Text depends on quadrant:
  - `elite`: "{Team} generates high possession value and sustains it under pressure — their VAEP rises when losing, not falls."
  - `pretenders`: "{Team} peaks in low-pressure situations but shows a measurable VAEP drop in deficit states. Their performance on the scoresheet overstates their resilience."
  - `grinders`: "{Team}'s baseline output is modest, but their VAEP rate holds steady — or rises — when chasing a deficit. A dangerous team to face when they're behind."
  - `fragile`: "{Team}'s possession value collapses under pressure. Their tournament exits tend to follow the first moment they fall behind."

**Acceptance criteria.**
- All four cards render without null errors for Argentina 2022, France 2022, Morocco 2022, and Qatar 2022.
- Navigating directly to `/team/Morocco_2022` works without going through Home first.
- The insight callout text is different for a `grinders` team vs an `elite` team.

---

### 3.11 — `frontend/src/pages/Live2026.jsx`

**Purpose.** Show preliminary WC 2026 pressure data using results-based proxy PRS.

**Inputs.** `fetchLiveTeams()` from `lib/api.js`.

**Outputs.**
- Page header: "FIFA World Cup 2026 — Live" with `--accent` on "Live".
- Disclaimer banner: amber background, explaining that 2026 PRS is a results-based proxy (goals scored while trailing / total goals), not VAEP-derived, and that it will be replaced by a full VAEP model after the tournament concludes. This disclaimer is non-dismissable and always visible.
- If no data: empty state card with "Live data warming up" message and expected refresh interval.
- If data available: ranked leaderboard of 2026 teams with proxy PRS values, same card design as Home leaderboard.
- "Last updated" timestamp shown below the leaderboard: formatted as `"Updated {N} minutes ago"` computed from a refresh timestamp stored in `live_2026.parquet` and served via the API.
- A note at the bottom: "Compare with 2022 historical results →" linking to Home.

**Acceptance criteria.**
- Page renders without errors when live data is empty.
- Disclaimer is always visible — it cannot be dismissed or hidden.
- "Last updated" shows a meaningful timestamp once data is available.

---

### 3.12 — `frontend/src/pages/Methodology.jsx`

**Purpose.** Render the methodology explanation and the core regression finding for judges.

**Inputs.** `useMethodology()` hook + `fetchRegression()` from `lib/api.js`.

**Outputs.**
- Page header: "Methodology".
- RegressionPanel at the top — the most analytically important content, shown first.
- Rendered markdown below: the content of `docs/methodology.md`, rendered with a markdown renderer so headings, bold, and lists display correctly (not as raw symbols). Use `react-markdown` package.
- Cross-tournament validation teaser: a small callout box showing "This framework was also applied to EURO 2024 and Copa América 2024 data. Teams with high WC 2022 PRS scores showed [pattern TBD based on actual data] in subsequent tournaments." This is qualitative — just a sentence summarizing `validation_features.parquet`.

**Acceptance criteria.**
- RegressionPanel renders the headline finding in large text.
- Markdown renders with formatted headings and lists — no raw `#` or `**` characters visible.
- Page loads without errors even if the regression endpoint is slow (show a spinner for the regression panel specifically while it loads).

---

## Part 4: Documentation and ops

### 4.1 — `docs/methodology.md`

**Purpose.** Plain-language explanation of the model, written for a judge who may not know what VAEP stands for. Served by the API and rendered on the Methodology page.

**Inputs.** None — hand-written prose.

**Content structure (in order):**
1. **The question** (one paragraph): what we set out to understand, stated in plain language.
2. **The data** (one paragraph): what StatsBomb open data is, what tournaments it covers, why it's the right foundation.
3. **The metric** (two paragraphs): what VAEP is in plain language ("each pass, carry, or shot is assigned a value based on how much it increases or decreases the team's probability of scoring"), what VAEP rate per game state measures, and what PRS is.
4. **The finding** (one paragraph): the regression result stated as a concrete empirical claim. Placeholder with actual numbers to be filled in after pipeline runs: "Teams with a PRS in the top quartile were X times less likely to be eliminated in each knockout round than teams in the bottom quartile. PRS alone explained X% of knockout exit variance — [N times / nearly N times] more explanatory than FIFA ranking."
5. **Limitations** (one paragraph): small sample sizes (64 teams across two tournaments), that VAEP does not capture everything (set pieces are partially excluded, goalkeeping is not modeled), and that the 2026 live proxy is not the same metric.
6. **Data and code** (one short paragraph): StatsBomb attribution, socceraction citation, GitHub link.

**Acceptance criteria.**
- A reader who has never heard of EPA or VAEP can explain the project's main claim back in their own words after reading it once.
- The finding paragraph contains specific numbers (not placeholders) in the final committed version.
- StatsBomb is attributed by name as required by their open data terms.

---

### 4.2 — `README.md` (repo root)

**Purpose.** The first thing a judge reads. Carries a meaningful share of the Data Presentation score.

**Content structure (in order):**
1. Project name and one-line description.
2. Live URL (Vercel) and API URL (Render), both clickable.
3. The thesis and finding in two sentences — written first, not buried.
4. Two or three embedded screenshots: Home scatter plot, Argentina 2022 team detail, Methodology page with regression panel.
5. "How it works" section: four bullet points covering data source, VAEP computation, PRS derivation, regression.
6. "Run locally" section: exact commands for both backend (`uvicorn`) and frontend (`npm run dev`), and the pipeline scripts in order.
7. Data attribution for StatsBomb.

**Acceptance criteria.**
- Screenshots are committed in `screenshots/` and render correctly on GitHub's web UI.
- A reader who only reads the first three sections and looks at the screenshots understands what the project found.
- `README.md` references no placeholder text like "YOUR_URL" — all links are real deployed URLs.

---

### 4.3 — Deployment

**Backend → Render:**
- Service type: Web Service
- Root directory: `backend/`
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Environment variables to set in Render dashboard: `ENVIRONMENT=production`, `ALLOWED_ORIGINS=https://your-vercel-url.vercel.app`, `FOOTBALL_DATA_API_KEY=<key from football-data.org>`

**Frontend → Vercel:**
- Framework preset: Vite
- Root directory: `frontend/`
- Environment variable: `VITE_API_BASE_URL=https://your-render-url.onrender.com`
- After deploy, update `ALLOWED_ORIGINS` in Render to the real Vercel URL and redeploy backend

**Keep-alive cron:**
- Register at cron-job.org (free)
- URL: `https://your-render-url.onrender.com/health`
- Schedule: every 14 minutes
- Verify "last run: success" before demo day

**Acceptance criteria.**
- Hard refresh on `/team/Argentina_2022` on the Vercel URL returns the team detail page, not 404.
- First request to Render (cold start) after 14 minutes of inactivity returns in under 3 seconds because the cron ping prevented sleep.
- Both deployed URLs are in `README.md` and `docs/methodology.md`.

---

### 4.4 — `screenshots/`

**Purpose.** Visual proof of the working product inside the repo, independent of whether the live link is reachable at review time.

**Required screenshots:**
1. `screenshots/home_scatter.png` — the full Home page showing the quadrant scatter with all 64 team dots and the leaderboard below.
2. `screenshots/team_detail_argentina.png` — the Argentina 2022 team detail page showing the ResilienceCard, PressureCurve, and StageDropoff all populated with real data.
3. `screenshots/methodology_regression.png` — the Methodology page showing the regression panel with the headline finding and the model comparison cards.
4. `screenshots/live_2026.png` — the Live 2026 tab with the disclaimer banner and at least a few teams listed.

**Acceptance criteria.**
- All four PNGs are committed to the repo and referenced with `![]()` tags in `README.md`.
- Each screenshot is taken from the deployed Vercel URL, not localhost (to confirm deployment works, not just dev).
- Images are under 1MB each (compress if needed — use macOS Screenshot → Preview → Export at reduced quality, or `pngcrush`).
