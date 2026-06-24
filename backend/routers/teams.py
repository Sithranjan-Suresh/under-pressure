import json
import math

import pandas as pd
from fastapi import APIRouter, HTTPException, Request

router = APIRouter()

CANONICAL_STATES = [
    ("winning_big", "Winning Big"),
    ("winning_close", "Winning Close"),
    ("level", "Level"),
    ("losing_close", "Losing Close"),
    ("losing_big", "Losing Big"),
]


def safe_float(val):
    if val is None or pd.isna(val):
        return None
    return float(val)


def safe_int(val):
    if val is None or pd.isna(val):
        return None
    return int(val)


def team_to_dict(row):
    return {
        "team_id": row["team_id"],
        "team_name": row["team_name"],
        "flag_emoji": row["flag_emoji"],
        "tournament": row["tournament"],
        "prs": safe_float(row["prs"]),
        "adj_prs": safe_float(row["adj_prs"]),
        "ppi": safe_float(row["ppi"]),
        "stage_retention": safe_float(row["stage_retention"]),
        "quadrant": row["quadrant"] if isinstance(row["quadrant"], str) else None,
        "matches_played": int(row["matches_played"]),
        "group_vaep_avg": safe_float(row["group_vaep_avg"]),
        "knockout_vaep_avg": safe_float(row["knockout_vaep_avg"]),
        "reached_final": bool(row["reached_final"]),
        "tournament_result": row["tournament_result"],
        "combined_prs_rank": safe_int(row["combined_prs_rank"]),
        "losing_sample_size": int(row["losing_sample_size"]),
        "low_sample_warning": bool(row["low_sample_warning"]),
        "surprising_result_note": row["surprising_result_note"] if isinstance(row["surprising_result_note"], str) else None,
        "pressure_insight": row["pressure_insight"] if isinstance(row["pressure_insight"], str) else None,
    }


@router.get("/teams")
def get_teams(request: Request):
    teams = request.app.state.app_state["teams"]
    sorted_teams = teams.sort_values("prs", ascending=False, na_position="last")
    return [team_to_dict(row) for _, row in sorted_teams.iterrows()]


@router.get("/team/{team_id}")
def get_team(team_id: str, request: Request):
    teams = request.app.state.app_state["teams"]
    curves = request.app.state.app_state["curves"]

    match = teams[teams["team_id"] == team_id]
    if match.empty:
        match = teams[teams["team_id"].str.lower() == team_id.lower()]
    if match.empty:
        sample = teams["team_id"].head(5).tolist()
        raise HTTPException(
            status_code=404,
            detail=f"Team '{team_id}' not found. Available IDs include: {sample}",
        )

    row = match.iloc[0]
    result = team_to_dict(row)
    result["prs_rank"] = safe_int(row["prs_rank"])
    result["ppi_rank"] = safe_int(row["ppi_rank"])
    result["fifa_rank"] = safe_int(row["fifa_rank"])

    team_curves = curves[curves["team_id"] == row["team_id"]].set_index("state")
    pressure_curve = []
    for state, label in CANONICAL_STATES:
        if state in team_curves.index:
            c = team_curves.loc[state]
            pressure_curve.append(
                {
                    "state": state,
                    "label": label,
                    "vaep_rate": safe_float(c["vaep_rate"]),
                    "action_count": int(c["action_count"]),
                }
            )
        else:
            pressure_curve.append({"state": state, "label": label, "vaep_rate": None, "action_count": 0})
    result["pressure_curve"] = pressure_curve

    result["match_timeline"] = json.loads(row["match_timeline_json"]) if row["match_timeline_json"] else []

    return result
