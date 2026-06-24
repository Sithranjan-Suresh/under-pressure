from typing import Optional

from fastapi import APIRouter, Request

from routers.teams import safe_float

router = APIRouter()


@router.get("/matches")
def get_matches(request: Request, tournament: Optional[str] = None):
    matches = request.app.state.app_state["matches"]

    if tournament is not None:
        if tournament not in ("2018", "2022"):
            return []
        matches = matches[matches["tournament"] == tournament]

    matches = matches.sort_values(["tournament", "tournament_pressure", "match_id"])

    return [
        {
            "match_id": int(row["match_id"]),
            "home_team": row["home_team"],
            "away_team": row["away_team"],
            "home_team_id": row["home_team_id"],
            "away_team_id": row["away_team_id"],
            "home_score": int(row["home_score"]),
            "away_score": int(row["away_score"]),
            "stage": row["stage"],
            "tournament_pressure": int(row["tournament_pressure"]),
            "home_vaep_avg": safe_float(row["home_vaep_avg"]),
            "away_vaep_avg": safe_float(row["away_vaep_avg"]),
            "tournament": row["tournament"],
        }
        for _, row in matches.iterrows()
    ]
