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

## How it works

- **Data**: [StatsBomb Open Data](https://github.com/statsbomb/open-data) event data for WC
  2018, WC 2022 (primary), plus Copa América 2024 and EURO 2024 (exploratory validation only).
- **VAEP**: every on-ball action is converted to SPADL format and scored with `socceraction`'s
  VAEP model, fit locally on the action corpus, producing a per-action possession-value rating.
- **PRS**: each team's average VAEP rate while losing is compared against their baseline
  (level-game-state) rate, as a descriptive measure of pressure resilience.
- **Validation**: the primary claim (match-VAEP-accuracy) and the secondary PRS regression are
  both computed in `backend/pipeline/04_run_regression.py` and served at `/api/regression`.

## Run locally

**Backend:**
```
cd backend
python -m venv venv
source venv/Scripts/activate  # or venv/bin/activate on macOS/Linux
pip install -r requirements.txt
ENVIRONMENT=development uvicorn main:app --port 8000
```

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
their open data terms. Possession-value modeling via
[`socceraction`](https://github.com/ML-KULeuven/socceraction)'s VAEP implementation.
