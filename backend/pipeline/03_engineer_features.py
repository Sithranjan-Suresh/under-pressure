"""Aggregate VAEP action-level data into team-tournament-level features.

Also computes cross-tournament validation metrics (PPI, raw PRS) for Copa America 2024 and
EURO 2024, using the same SPADL + VAEP pipeline as 02_compute_vaep.py, but inline and without
saving intermediate parquets. Validation output is exploratory only and never mixed into the
primary team_features.parquet.
"""

import warnings

warnings.filterwarnings("ignore")

import pandas as pd
import socceraction.data.statsbomb as sbdata
import socceraction.spadl as spadl
import socceraction.spadl.statsbomb as sbspadl
from socceraction.vaep import VAEP

RAW_DIR = "raw"
PROCESSED_DIR = "processed"

GAME_STATES = ["level", "winning_close", "winning_big", "losing_close", "losing_big"]
MIN_ACTIONS_PER_STATE = 15
MIN_LOSING_ACTIONS = 10

PRESSURE_SCALE = {
    "Group Stage": 1,
    "Round of 16": 2,
    "Quarter-finals": 3,
    "Semi-finals": 4,
    "3rd Place Final": 4,
    "Final": 5,
}

FLAG_EMOJIS = {
    "Argentina": "🇦🇷", "France": "🇫🇷", "Morocco": "🇲🇦", "Croatia": "🇭🇷",
    "England": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "Netherlands": "🇳🇱", "Brazil": "🇧🇷", "Portugal": "🇵🇹",
    "Spain": "🇪🇸", "Japan": "🇯🇵", "South Korea": "🇰🇷", "Australia": "🇦🇺",
    "Switzerland": "🇨🇭", "Senegal": "🇸🇳", "United States": "🇺🇸", "Poland": "🇵🇱",
    "Denmark": "🇩🇰", "Tunisia": "🇹🇳", "Mexico": "🇲🇽", "Uruguay": "🇺🇾",
    "Ecuador": "🇪🇨", "Ghana": "🇬🇭", "Germany": "🇩🇪", "Costa Rica": "🇨🇷",
    "Serbia": "🇷🇸", "Belgium": "🇧🇪", "Canada": "🇨🇦", "Cameroon": "🇨🇲",
    "Saudi Arabia": "🇸🇦", "Iran": "🇮🇷", "Qatar": "🇶🇦", "Wales": "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
    "Russia": "🇷🇺", "Sweden": "🇸🇪", "Colombia": "🇨🇴", "Panama": "🇵🇦",
    "Peru": "🇵🇪", "Iceland": "🇮🇸", "Nigeria": "🇳🇬", "Egypt": "🇪🇬",
}

loader = sbdata.StatsBombLoader(getter="remote")


def compute_team_ppi_prs(vaep_df, tournament_label):
    """Given a long actions DataFrame with team_name/game_state/vaep_value/tournament_pressure/
    match_id/home_team/away_team columns, return a per-team-tournament feature DataFrame.
    """
    rows = []
    for team_name, team_actions in vaep_df.groupby("team_name"):
        row = {"team_name": team_name, "tournament": tournament_label}
        row["matches_played"] = team_actions["match_id"].nunique()

        for state in GAME_STATES:
            state_actions = team_actions[team_actions["game_state"] == state]
            row[f"action_count_{state}"] = len(state_actions)
            if len(state_actions) >= MIN_ACTIONS_PER_STATE:
                row[f"vaep_rate_{state}"] = state_actions["vaep_value"].mean()
            else:
                row[f"vaep_rate_{state}"] = None

        group_actions = team_actions[team_actions["tournament_pressure"] == 1]
        knockout_actions = team_actions[team_actions["tournament_pressure"] >= 2]
        row["group_vaep_avg"] = group_actions["vaep_value"].mean() if len(group_actions) else None
        row["knockout_vaep_avg"] = (
            knockout_actions["vaep_value"].mean() if len(knockout_actions) else None
        )
        row["stage_retention"] = (
            row["knockout_vaep_avg"] / row["group_vaep_avg"]
            if row["knockout_vaep_avg"] is not None and row["group_vaep_avg"]
            else None
        )

        row["ppi"] = row["vaep_rate_level"]

        # raw_prs as an additive pressure_residual (vaep_losing - vaep_neutral) rather than a
        # ratio: a ratio blows up whenever ppi (the denominator) is near zero, which happens for
        # several real teams (e.g. Qatar 2022, Canada at Copa 2024) and produces nonsensical
        # outliers (-13, +6.3) that swamp genuine resilience signal. The additive residual is
        # also literally how "pressure_residual" is defined in the project's own model spec.
        n_losing_actions = row["action_count_losing_close"] + row["action_count_losing_big"]
        losing_rates = [
            r for r in (row["vaep_rate_losing_close"], row["vaep_rate_losing_big"]) if r is not None
        ]
        if row["ppi"] is not None and n_losing_actions >= MIN_LOSING_ACTIONS and len(losing_rates) > 0:
            row["raw_prs"] = (sum(losing_rates) / len(losing_rates)) - row["ppi"]
        else:
            row["raw_prs"] = None

        rows.append(row)

    features = pd.DataFrame(rows)

    # opponent strength: average PPI of opponents faced, normalized to this tournament's mean PPI
    league_mean_ppi = features["ppi"].mean()
    match_teams = vaep_df[["match_id", "home_team", "away_team"]].drop_duplicates()
    ppi_by_team = features.set_index("team_name")["ppi"].to_dict()

    opponent_ppis = {name: [] for name in features["team_name"]}
    for _, row in match_teams.iterrows():
        home, away = row["home_team"], row["away_team"]
        if home in opponent_ppis and ppi_by_team.get(away) is not None:
            opponent_ppis[home].append(ppi_by_team[away])
        if away in opponent_ppis and ppi_by_team.get(home) is not None:
            opponent_ppis[away].append(ppi_by_team[home])

    features["mean_opponent_ppi"] = features["team_name"].map(
        lambda name: (sum(opponent_ppis[name]) / len(opponent_ppis[name])) if opponent_ppis[name] else None
    )
    features["opponent_strength_factor"] = features["mean_opponent_ppi"].apply(
        lambda v: (v / league_mean_ppi - 1) if v is not None and league_mean_ppi else None
    )

    return features


def build_primary_features():
    v22 = pd.read_parquet(f"{RAW_DIR}/vaep_wc2022.parquet")
    v18 = pd.read_parquet(f"{RAW_DIR}/vaep_wc2018.parquet")

    feats_22 = compute_team_ppi_prs(v22, "2022")
    feats_18 = compute_team_ppi_prs(v18, "2018")
    features = pd.concat([feats_22, feats_18], ignore_index=True)

    features["team_id"] = features["team_name"] + "_" + features["tournament"]
    features["flag_emoji"] = features["team_name"].map(FLAG_EMOJIS)

    rankings = pd.read_csv("../data/raw/fifa_rankings_raw.csv", dtype={"tournament": str})
    features = features.merge(rankings, on=["team_name", "tournament"], how="left")

    missing = features[features["fifa_rank"].isna()]
    if len(missing):
        print("WARNING: teams missing from fifa_rankings_raw.csv:", missing["team_id"].tolist())

    features["reached_final"] = features["tournament_result"].isin(["Winner", "Runner-Up"])
    features["sufficient_data"] = features["vaep_rate_level"].notna() & features["raw_prs"].notna()

    return features


def compute_validation_tournament(competition_id, season_id, label):
    """Inline VAEP computation for a validation tournament (Copa America 2024 / EURO 2024)."""
    games = loader.games(competition_id, season_id)

    match_actions = {}
    total = len(games)
    for i, (_, game) in enumerate(games.iterrows(), start=1):
        game_id = game["game_id"]
        print(f"[{label}] Computing SPADL actions {i}/{total}: {game_id}")
        try:
            events = loader.events(game_id)
            actions = sbspadl.convert_to_actions(events=events, home_team_id=int(game["home_team_id"]))
            actions = spadl.add_names(actions)
        except Exception as exc:
            print(f"[{label}] Failed match {game_id}: {exc}")
            continue
        match_actions[game_id] = (game, actions)

    model = VAEP(nb_prev_actions=3)
    feature_frames, label_frames = [], []
    for game_id, (game, actions) in match_actions.items():
        feature_frames.append(model.compute_features(game, actions))
        label_frames.append(model.compute_labels(game, actions))
    X = pd.concat(feature_frames).reset_index(drop=True)
    Y = pd.concat(label_frames).reset_index(drop=True)
    print(f"[{label}] Fitting VAEP model on {len(X)} actions...")
    model.fit(X, Y)

    team_names = {}
    for _, game in games.iterrows():
        team_names[game["home_team_id"]] = game.get("home_team_name", game["home_team_id"])
        team_names[game["away_team_id"]] = game.get("away_team_name", game["away_team_id"])
    teams_lookup = pd.concat(
        [loader.teams(gid) for gid in list(match_actions.keys())[:1]]
    ) if match_actions else pd.DataFrame()

    tagged_frames = []
    for game_id, (game, actions) in match_actions.items():
        try:
            rated = model.rate(game, actions)
        except Exception as exc:
            print(f"[{label}] Failed to rate match {game_id}: {exc}")
            continue
        rated.index = actions.index
        actions = actions.join(rated)

        is_goal = (actions["type_name"].isin({"shot", "shot_freekick", "shot_penalty"}) & (actions["result_name"] == "success")) | (
            actions["result_name"] == "owngoal"
        )
        # score_diff/game_state not needed for validation PPI (only group/level state used for PPI),
        # but losing-state PRS still requires it -- reuse the same tagging approach as script 02.
        home_team_id, away_team_id = int(game["home_team_id"]), int(game["away_team_id"])
        goals = actions.loc[is_goal, ["period_id", "time_seconds", "team_id", "result_name"]].copy()
        goals["scoring_team_id"] = goals.apply(
            lambda r: (
                away_team_id if (r["result_name"] == "owngoal" and r["team_id"] == home_team_id)
                else home_team_id if (r["result_name"] == "owngoal" and r["team_id"] == away_team_id)
                else r["team_id"]
            ),
            axis=1,
        )
        goals = goals.sort_values(["period_id", "time_seconds"]).reset_index(drop=True)

        actions_sorted_idx = actions.sort_values(["period_id", "time_seconds"]).index.tolist()
        home_count = away_count = goal_idx = 0
        n_goals = len(goals)
        home_before, away_before = [], []
        for idx in actions_sorted_idx:
            period_id = actions.at[idx, "period_id"]
            time_seconds = actions.at[idx, "time_seconds"]
            while goal_idx < n_goals and (
                goals.at[goal_idx, "period_id"] < period_id
                or (goals.at[goal_idx, "period_id"] == period_id and goals.at[goal_idx, "time_seconds"] < time_seconds)
            ):
                if goals.at[goal_idx, "scoring_team_id"] == home_team_id:
                    home_count += 1
                else:
                    away_count += 1
                goal_idx += 1
            home_before.append(home_count)
            away_before.append(away_count)
        score_state = pd.DataFrame({"home_goals_before": home_before, "away_goals_before": away_before}, index=actions_sorted_idx)
        actions = actions.join(score_state)

        def score_diff_for_row(r):
            return int(r["home_goals_before"] - r["away_goals_before"]) if r["team_id"] == home_team_id else int(r["away_goals_before"] - r["home_goals_before"])

        actions["score_diff"] = actions.apply(score_diff_for_row, axis=1)

        def classify(d):
            if d >= 2:
                return "winning_big"
            if d == 1:
                return "winning_close"
            if d == 0:
                return "level"
            if d == -1:
                return "losing_close"
            return "losing_big"

        actions["game_state"] = actions["score_diff"].apply(classify)
        actions = actions.drop(columns=["home_goals_before", "away_goals_before"])

        actions["match_id"] = game_id
        actions["home_team_id_col"] = home_team_id
        actions["away_team_id_col"] = away_team_id
        actions["tournament_pressure"] = PRESSURE_SCALE[game["competition_stage"]]
        tagged_frames.append(actions)

    full = pd.concat(tagged_frames, ignore_index=True)

    # Resolve team_id -> team_name via socceraction's per-game teams() lookup.
    team_name_map = {}
    for gid in full["match_id"].unique():
        try:
            t = loader.teams(gid)
            for _, r in t.iterrows():
                team_name_map[r["team_id"]] = r["team_name"]
        except Exception:
            continue
    full["team_name"] = full["team_id"].map(team_name_map)

    home_away = (
        full[["match_id", "team_id"]]
        .drop_duplicates()
        .merge(full[["match_id", "home_team_id_col", "away_team_id_col"]].drop_duplicates(), on="match_id")
    )
    full["home_team"] = full["match_id"].map(
        full.drop_duplicates("match_id").set_index("match_id")["home_team_id_col"].map(team_name_map)
    )
    full["away_team"] = full["match_id"].map(
        full.drop_duplicates("match_id").set_index("match_id")["away_team_id_col"].map(team_name_map)
    )

    feats = compute_team_ppi_prs(full, label)
    feats["team_id"] = feats["team_name"] + "_" + feats["tournament"]
    return feats


if __name__ == "__main__":
    features = build_primary_features()
    features.to_parquet(f"{PROCESSED_DIR}/team_features.parquet")
    print(f"Saved team_features.parquet with {len(features)} rows")
    print(f"sufficient_data True: {features['sufficient_data'].sum()} / {len(features)}")

    print("\nArgentina 2022 spot check:")
    arg = features[features["team_id"] == "Argentina_2022"].iloc[0]
    print(f"  vaep_rate_level={arg['vaep_rate_level']:.4f} vaep_rate_losing_close={arg['vaep_rate_losing_close']}")

    print("\nMorocco 2022 raw_prs rank:")
    t2022 = features[features["tournament"] == "2022"].dropna(subset=["raw_prs"])
    t2022 = t2022.sort_values("raw_prs", ascending=False).reset_index(drop=True)
    print(t2022[["team_name", "raw_prs"]].head(12))

    validation_frames = []
    for comp_id, season_id, label in [(223, 282, "copa2024"), (55, 282, "euro2024")]:
        validation_frames.append(compute_validation_tournament(comp_id, season_id, label))
    validation = pd.concat(validation_frames, ignore_index=True)
    validation.to_parquet(f"{PROCESSED_DIR}/validation_features.parquet")
    print(f"\nSaved validation_features.parquet with {len(validation)} rows")
