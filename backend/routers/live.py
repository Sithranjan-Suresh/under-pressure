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
    "Algeria": "🇩🇿", "Austria": "🇦🇹", "Bosnia-Herzegovina": "🇧🇦", "Cape Verde Islands": "🇨🇻",
    "Colombia": "🇨🇴", "Congo DR": "🇨🇩", "Curaçao": "🇨🇼", "Czechia": "🇨🇿",
    "Egypt": "🇪🇬", "Haiti": "🇭🇹", "Iraq": "🇮🇶", "Ivory Coast": "🇨🇮",
    "Jordan": "🇯🇴", "New Zealand": "🇳🇿", "Norway": "🇳🇴", "Panama": "🇵🇦",
    "Paraguay": "🇵🇾", "Scotland": "🏴󠁧󠁢󠁳󠁣󠁴󠁿", "South Africa": "🇿🇦", "Sweden": "🇸🇪",
    "Turkey": "🇹🇷", "Uzbekistan": "🇺🇿",
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

    # football-data.org's free tier only gives halfTime/fullTime scores, not a minute-by-minute
    # goal timeline. Using the FINAL result to decide who "scored while trailing" is wrong: it
    # credits a team only if they lost overall, missing every team that fell behind and came
    # back to win or draw (e.g. a team down 0-1 at half time that scores twice in the second
    # half to win 2-1 clearly scored while trailing, but the old logic gave them zero credit).
    #
    # The fix: use the half-time score as a real mid-match checkpoint. If a team was behind at
    # half time, credit them with every goal they scored in the second half (fullTime - halfTime)
    # as "scored while trailing" -- the first such goal is unambiguously scored while behind; a
    # second one technically might come after they'd already equalized, so this slightly
    # over-credits long comebacks, but it is honest about being a coarse, half/full-time-based
    # proxy rather than claiming false precision. It is the most accurate signal extractable from
    # the data this API tier actually provides.
    trailing_goals = {}
    matches_played = {}
    for m in finished:
        home = m["homeTeam"]["name"]
        away = m["awayTeam"]["name"]
        ht_home = m["score"]["halfTime"]["home"]
        ht_away = m["score"]["halfTime"]["away"]
        ft_home = m["score"]["fullTime"]["home"]
        ft_away = m["score"]["fullTime"]["away"]
        matches_played[home] = matches_played.get(home, 0) + 1
        matches_played[away] = matches_played.get(away, 0) + 1
        trailing_goals.setdefault(home, 0)
        trailing_goals.setdefault(away, 0)

        if None in (ht_home, ht_away, ft_home, ft_away):
            continue

        if ht_home < ht_away:
            trailing_goals[home] += max(0, ft_home - ht_home)
        if ht_away < ht_home:
            trailing_goals[away] += max(0, ft_away - ht_away)

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
