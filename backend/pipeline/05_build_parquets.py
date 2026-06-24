"""Build the final parquet files the API serves: normalize PRS, classify quadrants,
join match-level data, and write clean DataFrames to backend/data/.
"""

import json
from datetime import date

import numpy as np
import pandas as pd

RAW_DIR = "raw"
PROCESSED_DIR = "processed"
DATA_DIR = "../data"

GAME_STATES = [
    ("winning_big", "Winning Big"),
    ("winning_close", "Winning Close"),
    ("level", "Level"),
    ("losing_close", "Losing Close"),
    ("losing_big", "Losing Big"),
]


def normalize_0_100(series, mask):
    """Min-max normalize to 0-100 using only rows where mask is True; others -> NaN."""
    valid = series[mask]
    lo, hi = valid.min(), valid.max()
    normalized = (series - lo) / (hi - lo) * 100
    normalized[~mask] = np.nan
    return normalized.round(1)


def build_teams_historical(features):
    df = features.copy()
    mask = df["sufficient_data"]

    df["prs"] = normalize_0_100(df["raw_prs"], mask)

    df["adj_prs_raw"] = df["raw_prs"] * (1 + df["opponent_strength_factor"])
    df["adj_prs"] = normalize_0_100(df["adj_prs_raw"], mask)

    prs_median = df.loc[mask, "prs"].median()
    ppi_median = df.loc[mask, "ppi"].median()

    def classify_quadrant(row):
        if not row["sufficient_data"]:
            return None
        high_ppi = row["ppi"] >= ppi_median
        high_prs = row["prs"] >= prs_median
        if high_ppi and high_prs:
            return "elite"
        if high_ppi and not high_prs:
            return "pretenders"
        if not high_ppi and high_prs:
            return "grinders"
        return "fragile"

    df["quadrant"] = df.apply(classify_quadrant, axis=1)

    df["prs_rank"] = df.groupby("tournament")["prs"].rank(ascending=False, method="min")
    df["ppi_rank"] = df.groupby("tournament")["ppi"].rank(ascending=False, method="min")
    df["prs_rank"] = df["prs_rank"].astype("Int64")
    df["ppi_rank"] = df["ppi_rank"].astype("Int64")

    for col in ["ppi", "group_vaep_avg", "knockout_vaep_avg", "stage_retention"]:
        df[col] = df[col].round(4)
    for col in ["prs", "adj_prs"]:
        df[col] = df[col].round(1)

    return df, prs_median, ppi_median


def build_match_timeline(features_row, matches_raw, vaep_raw):
    team_name, tournament = features_row["team_name"], features_row["tournament"]
    team_matches = matches_raw[
        (matches_raw["home_team"] == team_name) | (matches_raw["away_team"] == team_name)
    ].sort_values("match_id")

    open_play = vaep_raw[vaep_raw["period_id"] != 5]
    match_vaep = open_play.groupby(["match_id", "team_name"])["vaep_value"].mean()

    timeline = []
    for _, m in team_matches.iterrows():
        is_home = m["home_team"] == team_name
        opponent = m["away_team"] if is_home else m["home_team"]
        team_score = m["home_score"] if is_home else m["away_score"]
        opp_score = m["away_score"] if is_home else m["home_score"]

        if team_score > opp_score:
            result = "W"
        elif team_score < opp_score:
            result = "L"
        else:
            result = "D"

        team_vaep = match_vaep.get((m["match_id"], team_name))
        opp_vaep = match_vaep.get((m["match_id"], opponent))

        timeline.append(
            {
                "match_id": int(m["match_id"]),
                "opponent": opponent,
                "stage": m["competition_stage"],
                "tournament_pressure": PRESSURE_SCALE[m["competition_stage"]],
                "result": result,
                "team_vaep_avg": round(float(team_vaep), 4) if pd.notna(team_vaep) else None,
                "opponent_vaep_avg": round(float(opp_vaep), 4) if pd.notna(opp_vaep) else None,
            }
        )
    return timeline


PRESSURE_SCALE = {
    "Group Stage": 1,
    "Round of 16": 2,
    "Quarter-finals": 3,
    "Semi-finals": 4,
    "3rd Place Final": 4,
    "Final": 5,
}


def build_pressure_curves(features):
    rows = []
    for _, row in features.iterrows():
        for state, label in GAME_STATES:
            rows.append(
                {
                    "team_id": row["team_id"],
                    "team_name": row["team_name"],
                    "tournament": row["tournament"],
                    "state": state,
                    "label": label,
                    "vaep_rate": (
                        round(float(row[f"vaep_rate_{state}"]), 4)
                        if pd.notna(row[f"vaep_rate_{state}"])
                        else None
                    ),
                    "action_count": int(row[f"action_count_{state}"]),
                }
            )
    return pd.DataFrame(rows)


def build_matches_historical():
    frames = []
    for label, year in [("wc2022", "2022"), ("wc2018", "2018")]:
        matches = pd.read_parquet(f"{RAW_DIR}/matches_{label}.parquet")
        vaep = pd.read_parquet(f"{RAW_DIR}/vaep_{label}.parquet")
        open_play = vaep[vaep["period_id"] != 5]
        match_vaep = open_play.groupby(["match_id", "team_name"])["vaep_value"].mean()

        out = matches[
            ["match_id", "home_team", "away_team", "home_score", "away_score", "competition_stage"]
        ].copy()
        out["home_team_id"] = out["home_team"] + "_" + year
        out["away_team_id"] = out["away_team"] + "_" + year
        out["stage"] = out["competition_stage"]
        out["tournament_pressure"] = out["competition_stage"].map(PRESSURE_SCALE)
        out["home_vaep_avg"] = out.apply(
            lambda r: round(float(match_vaep.get((r["match_id"], r["home_team"]), np.nan)), 4), axis=1
        )
        out["away_vaep_avg"] = out.apply(
            lambda r: round(float(match_vaep.get((r["match_id"], r["away_team"]), np.nan)), 4), axis=1
        )
        out["tournament"] = year
        frames.append(
            out[
                [
                    "match_id", "home_team", "away_team", "home_team_id", "away_team_id",
                    "home_score", "away_score", "stage", "tournament_pressure",
                    "home_vaep_avg", "away_vaep_avg", "tournament",
                ]
            ]
        )
    return pd.concat(frames, ignore_index=True)


if __name__ == "__main__":
    features = pd.read_parquet(f"{PROCESSED_DIR}/team_features.parquet")

    missing_results = features[features["tournament_result"].isna()]
    if len(missing_results):
        print("WARNING: teams missing tournament_result:", missing_results["team_id"].tolist())

    teams_df, prs_median, ppi_median = build_teams_historical(features)

    raw_by_tournament = {
        "2022": (
            pd.read_parquet(f"{RAW_DIR}/matches_wc2022.parquet"),
            pd.read_parquet(f"{RAW_DIR}/vaep_wc2022.parquet"),
        ),
        "2018": (
            pd.read_parquet(f"{RAW_DIR}/matches_wc2018.parquet"),
            pd.read_parquet(f"{RAW_DIR}/vaep_wc2018.parquet"),
        ),
    }

    timelines = []
    for _, row in teams_df.iterrows():
        matches_raw, vaep_raw = raw_by_tournament[row["tournament"]]
        timelines.append(json.dumps(build_match_timeline(row, matches_raw, vaep_raw)))
    teams_df["match_timeline_json"] = timelines

    output_cols = [
        "team_id", "team_name", "flag_emoji", "tournament", "prs", "adj_prs", "ppi",
        "ppi_rank", "prs_rank", "stage_retention", "quadrant", "matches_played",
        "group_vaep_avg", "knockout_vaep_avg", "reached_final", "tournament_result",
        "fifa_rank", "match_timeline_json",
    ]
    teams_df[output_cols].to_parquet(f"{DATA_DIR}/teams_historical.parquet")
    print(f"Saved teams_historical.parquet: {len(teams_df)} rows")

    curves_df = build_pressure_curves(features)
    curves_df.to_parquet(f"{DATA_DIR}/pressure_curves.parquet")
    print(f"Saved pressure_curves.parquet: {len(curves_df)} rows")

    matches_df = build_matches_historical()
    matches_df.to_parquet(f"{DATA_DIR}/matches_historical.parquet")
    print(f"Saved matches_historical.parquet: {len(matches_df)} rows")

    total_actions = sum(len(pd.read_parquet(f"{RAW_DIR}/vaep_{lbl}.parquet")) for lbl in ["wc2022", "wc2018"])

    try:
        with open(f"{DATA_DIR}/model_metadata.json") as f:
            metadata = json.load(f)
    except FileNotFoundError:
        metadata = {}

    metadata.update(
        {
            "prs_median": round(float(prs_median), 1),
            "ppi_median": round(float(ppi_median), 4),
            "tournaments_included": ["2018", "2022"],
            "total_teams": int(len(teams_df)),
            "total_actions": int(total_actions),
            "pipeline_run_date": date.today().isoformat(),
        }
    )
    with open(f"{DATA_DIR}/model_metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)
    print("Saved model_metadata.json")

    print("\n--- Leaderboard (sorted by PRS desc) ---")
    leaderboard = teams_df.sort_values("prs", ascending=False, na_position="last")
    print(leaderboard[["team_id", "prs", "adj_prs", "quadrant"]].head(15).to_string())
