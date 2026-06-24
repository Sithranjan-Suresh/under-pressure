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

# A team that rarely trailed (e.g. a tournament winner who led most matches) gets a tiny
# losing-state action sample, which makes their raw_prs noisy in either direction -- a single
# good or bad sequence while behind can swing it. Median losing-state sample size across all 64
# teams is ~975 actions; below this threshold the PRS value should be shown with a caveat rather
# than presented as equally reliable.
LOW_SAMPLE_THRESHOLD = 300


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

    df["losing_sample_size"] = (
        df["action_count_losing_close"].fillna(0) + df["action_count_losing_big"].fillna(0)
    ).astype(int)
    df["low_sample_warning"] = df["sufficient_data"] & (df["losing_sample_size"] < LOW_SAMPLE_THRESHOLD)

    combined_rank = df.sort_values("prs", ascending=False, na_position="last").index
    combined_rank_map = {idx: i + 1 for i, idx in enumerate(combined_rank)}
    df["combined_prs_rank"] = df.index.map(combined_rank_map)

    def surprising_result_note(row):
        if not row["sufficient_data"] or row["tournament_result"] not in ("Winner", "Runner-Up"):
            return None
        if row["combined_prs_rank"] <= 16:
            return None
        achievement = (
            f"won the {row['tournament']} World Cup"
            if row["tournament_result"] == "Winner"
            else f"reached the {row['tournament']} World Cup final"
        )
        if row["low_sample_warning"]:
            cause = (
                f"while rarely trailing on the scoreboard (only {row['losing_sample_size']} "
                "losing-state actions all tournament) -- limited opportunity to show resilience, "
                "not a weak team"
            )
        else:
            cause = (
                "without their VAEP output while behind ever being exceptional relative to the "
                "rest of the field -- PRS measures relative elevation under pressure, not whether "
                "a team ultimately won"
            )
        return f"{row['team_name']} {achievement} {cause}."

    df["surprising_result_note"] = df.apply(surprising_result_note, axis=1)

    def losing_state_rate(row):
        rates = [r for r in (row["vaep_rate_losing_close"], row["vaep_rate_losing_big"]) if pd.notna(r)]
        return sum(rates) / len(rates) if rates else None

    df["losing_state_rate"] = df.apply(losing_state_rate, axis=1)
    df["pressure_multiplier"] = df.apply(
        lambda r: r["losing_state_rate"] / r["ppi"]
        if r["sufficient_data"] and r["losing_state_rate"] is not None and r["ppi"] not in (None, 0) and r["ppi"] > 0
        else None,
        axis=1,
    )

    # Rank teams within their own tournament by multiplier, separately for "elevates under
    # pressure" (multiplier > 1, ranked descending -- biggest elevation first) and "collapses
    # under pressure" (multiplier < 1, ranked ascending -- biggest collapse first), so the
    # insight sentence can honestly say "the Nth-largest elevation/collapse of any {tournament}
    # team" instead of always claiming "the largest".
    elevates_mask = df["pressure_multiplier"] > 1
    collapses_mask = df["pressure_multiplier"] < 1
    df["elevation_rank"] = (
        df[elevates_mask].groupby("tournament")["pressure_multiplier"].rank(ascending=False, method="min")
    )
    df["collapse_rank"] = (
        df[collapses_mask].groupby("tournament")["pressure_multiplier"].rank(ascending=True, method="min")
    )

    def ordinal(n):
        n = int(n)
        if 10 <= n % 100 <= 20:
            suffix = "th"
        else:
            suffix = {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
        return f"{n}{suffix}"

    def pressure_insight(row):
        if not row["sufficient_data"] or row["pressure_multiplier"] is None:
            return (
                f"{row['team_name']}'s losing-state sample is too small this tournament to "
                "compute a reliable pressure profile."
            )
        m = row["pressure_multiplier"]
        ppi = row["ppi"]
        losing_rate = row["losing_state_rate"]
        if m > 1:
            rank = row["elevation_rank"]
            if pd.notna(rank) and rank == 1:
                rank_phrase = f"the largest pressure multiplier of any {row['tournament']} team"
            elif pd.notna(rank) and rank <= 5:
                rank_phrase = f"the {ordinal(rank)}-largest pressure multiplier of any {row['tournament']} team"
            else:
                rank_phrase = f"above their own baseline, but not among the largest multipliers in {row['tournament']}"
            return (
                f"{row['team_name']}'s VAEP rate in losing states ({losing_rate:.4f}) is "
                f"{m:.1f}× their level-state baseline ({ppi:.4f}) — {rank_phrase}."
            )
        else:
            rank = row["collapse_rank"]
            if pd.notna(rank) and rank == 1:
                rank_phrase = f"the steepest pressure collapse of any {row['tournament']} team"
            elif pd.notna(rank) and rank <= 5:
                rank_phrase = f"the {ordinal(rank)}-steepest pressure collapse of any {row['tournament']} team"
            else:
                rank_phrase = f"below their own baseline, though not among the steepest collapses in {row['tournament']}"
            return (
                f"{row['team_name']}'s VAEP rate in losing states ({losing_rate:.4f}) drops to "
                f"{m:.1f}× their level-state baseline ({ppi:.4f}) — {rank_phrase}."
            )

    df["pressure_insight"] = df.apply(pressure_insight, axis=1)

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
        "ppi_rank", "prs_rank", "combined_prs_rank", "stage_retention", "quadrant", "matches_played",
        "group_vaep_avg", "knockout_vaep_avg", "reached_final", "tournament_result",
        "fifa_rank", "losing_sample_size", "low_sample_warning", "surprising_result_note",
        "pressure_insight", "match_timeline_json",
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
