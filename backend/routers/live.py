import asyncio
import os
from datetime import datetime, timezone

import httpx
import pandas as pd
from fastapi import APIRouter, Request

from routers.teams import safe_float

router = APIRouter()

LIVE_PARQUET_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "live_2026.parquet")
REFRESH_INTERVAL_SECONDS = 30 * 60
FIRST_RUN_DELAY_SECONDS = 10

FLAG_EMOJIS = {
    "Argentina": "🇦🇷", "France": "🇫🇷", "Morocco": "🇲🇦", "Croatia": "🇭🇷",
    "England": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "Netherlands": "🇳🇱", "Brazil": "🇧🇷", "Portugal": "🇵🇹",
    "Spain": "🇪🇸", "Japan": "🇯🇵", "South Korea": "🇰🇷", "Australia": "🇦🇺",
    "Switzerland": "🇨🇭", "Senegal": "🇸🇳", "United States": "🇺🇸", "Poland": "🇵🇱",
    "Denmark": "🇩🇰", "Tunisia": "🇹🇳", "Mexico": "🇲🇽", "Uruguay": "🇺🇾",
    "Ecuador": "🇪🇨", "Ghana": "🇬🇭", "Germany": "🇩🇪", "Costa Rica": "🇨🇷",
    "Serbia": "🇷🇸", "Belgium": "🇧🇪", "Canada": "🇨🇦", "Cameroon": "🇨🇲",
    "Saudi Arabia": "🇸🇦", "Iran": "🇮🇷", "Qatar": "🇶🇦", "Wales": "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
}


@router.get("/live/teams")
def get_live_teams(request: Request):
    live = request.app.state.app_state["live"]
    if live.empty:
        return []
    return [
        {
            "team_id": row["team_id"],
            "team_name": row["team_name"],
            "flag_emoji": row.get("flag_emoji"),
            "tournament": "2026",
            "prs": safe_float(row.get("prs")),
            "adj_prs": None,
            "ppi": None,
            "stage_retention": None,
            "quadrant": None,
            "matches_played": int(row.get("matches_played", 0)),
            "group_vaep_avg": None,
            "knockout_vaep_avg": None,
            "reached_final": False,
            "tournament_result": None,
        }
        for _, row in live.iterrows()
    ]


@router.get("/live/refresh")
async def trigger_refresh(request: Request):
    asyncio.create_task(_run_refresh(request.app))
    return {"status": "refreshing", "message": "Live data refresh started"}


async def _fetch_proxy_prs():
    api_key = os.environ.get("FOOTBALL_DATA_API_KEY")
    if not api_key:
        print("[LIVE] No FOOTBALL_DATA_API_KEY set, skipping refresh")
        return pd.DataFrame()

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            "https://api.football-data.org/v4/competitions/2000/matches",
            headers={"X-Auth-Token": api_key},
        )
        resp.raise_for_status()
        data = resp.json()

    finished = [m for m in data.get("matches", []) if m.get("status") == "FINISHED"]
    if not finished:
        return pd.DataFrame()

    trailing_goals = {}
    matches_played = {}
    for m in finished:
        home = m["homeTeam"]["name"]
        away = m["awayTeam"]["name"]
        home_score = m["score"]["fullTime"]["home"]
        away_score = m["score"]["fullTime"]["away"]
        matches_played[home] = matches_played.get(home, 0) + 1
        matches_played[away] = matches_played.get(away, 0) + 1
        trailing_goals.setdefault(home, 0)
        trailing_goals.setdefault(away, 0)
        if home_score is not None and away_score is not None:
            if home_score < away_score:
                trailing_goals[home] += home_score
            if away_score < home_score:
                trailing_goals[away] += away_score

    teams = list(matches_played.keys())
    raw_values = pd.Series({t: trailing_goals.get(t, 0) for t in teams})
    lo, hi = raw_values.min(), raw_values.max()
    if hi == lo:
        normalized = pd.Series({t: 50.0 for t in teams})
    else:
        normalized = (raw_values - lo) / (hi - lo) * 100

    rows = []
    for t in teams:
        rows.append(
            {
                "team_id": f"{t}_2026",
                "team_name": t,
                "flag_emoji": FLAG_EMOJIS.get(t),
                "prs": round(float(normalized[t]), 1),
                "matches_played": matches_played[t],
            }
        )
    df = pd.DataFrame(rows)
    df["last_updated"] = datetime.now(timezone.utc).isoformat()
    return df


async def _run_refresh(app):
    try:
        df = await _fetch_proxy_prs()
    except Exception as exc:
        print(f"[LIVE] Refresh failed: {exc}")
        return
    if df.empty:
        return
    df.to_parquet(LIVE_PARQUET_PATH)
    app.state.app_state["live"] = df
    print(f"[LIVE] Refreshed: {len(df)} teams")


async def refresh_live_data(app):
    await asyncio.sleep(FIRST_RUN_DELAY_SECONDS)
    while True:
        await _run_refresh(app)
        await asyncio.sleep(REFRESH_INTERVAL_SECONDS)
