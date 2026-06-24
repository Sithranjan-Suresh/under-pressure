"""Convert StatsBomb events to SPADL and compute VAEP values per action for WC 2018 and WC 2022.

Tags every action with its game_state and tournament_pressure at the moment the action
occurred, based on the running score at that point in the match.

Note on socceraction API: the installed socceraction version has no `VAEP.load_model()` /
pretrained-weights download. A VAEP model must be fit locally on `compute_features` /
`compute_labels` output via `VAEP.fit(X, y)`. We fit one model on the combined WC2018+WC2022
action corpus (more training data, avoids per-tournament overfitting) and rate every match
with that single model. Also: `socceraction.spadl.statsbomb.convert_to_actions` requires events
in socceraction's own StatsBombLoader schema, not the flattened statsbombpy schema saved by
01_load_statsbomb.py — so this script re-fetches events via
`socceraction.data.statsbomb.StatsBombLoader`, using 01's `matches_*.parquet` only for the
team_id -> team_name / competition_stage mapping.
"""

import warnings

warnings.filterwarnings("ignore")

import pandas as pd
import socceraction.data.statsbomb as sbdata
import socceraction.spadl as spadl
import socceraction.spadl.statsbomb as sbspadl
from socceraction.vaep import VAEP

RAW_DIR = "raw"

TOURNAMENTS = [
    {"competition_id": 43, "season_id": 106, "label": "wc2022"},
    {"competition_id": 43, "season_id": 3, "label": "wc2018"},
]

PRESSURE_SCALE = {
    "Group Stage": 1,
    "Round of 16": 2,
    "Quarter-finals": 3,
    "Semi-finals": 4,
    "3rd Place Final": 4,
    "Final": 5,
}

GOAL_TYPES = {"shot", "shot_freekick", "shot_penalty"}

loader = sbdata.StatsBombLoader(getter="remote")


def load_match_actions(competition_id, season_id, label):
    """Fetch events for every match in a tournament and convert to named SPADL actions."""
    matches_meta = pd.read_parquet(f"{RAW_DIR}/matches_{label}.parquet")
    team_names = {}
    for _, row in matches_meta.iterrows():
        team_names[row["home_team_id"]] = row["home_team"]
        team_names[row["away_team_id"]] = row["away_team"]

    games = loader.games(competition_id, season_id)
    games = games.merge(
        matches_meta[["match_id", "home_team", "away_team"]],
        left_on="game_id",
        right_on="match_id",
    )

    match_actions = {}
    total = len(games)
    for i, (_, game) in enumerate(games.iterrows(), start=1):
        game_id = game["game_id"]
        print(f"[{label}] Computing SPADL actions {i}/{total}: {game_id}")
        try:
            events = loader.events(game_id)
            actions = sbspadl.convert_to_actions(
                events=events, home_team_id=int(game["home_team_id"])
            )
            actions = spadl.add_names(actions)
        except Exception as exc:
            print(f"[{label}] Failed match {game_id}: {exc}")
            continue
        match_actions[game_id] = (game, actions)

    return match_actions, team_names


def tag_score_state(actions, home_team_id, away_team_id):
    """Add score_diff and game_state columns based on the running score at each action's timestamp.

    Goals are detected from successful shots (incl. free kicks / penalties) and own goals.
    If a goal and an action share the exact same (period_id, time_seconds), the goal is treated
    as occurring after the action — the action must not be tagged using a score that hasn't
    happened yet from its own perspective.
    """
    is_goal = (actions["type_name"].isin(GOAL_TYPES) & (actions["result_name"] == "success")) | (
        actions["result_name"] == "owngoal"
    )
    goals = actions.loc[is_goal, ["period_id", "time_seconds", "team_id", "result_name"]].copy()
    # an own goal credits the *other* team
    goals["scoring_team_id"] = goals.apply(
        lambda r: (
            away_team_id
            if (r["result_name"] == "owngoal" and r["team_id"] == home_team_id)
            else home_team_id
            if (r["result_name"] == "owngoal" and r["team_id"] == away_team_id)
            else r["team_id"]
        ),
        axis=1,
    )
    goals = goals.sort_values(["period_id", "time_seconds"]).reset_index(drop=True)

    home_goals_before = []
    away_goals_before = []
    home_count = 0
    away_count = 0
    goal_idx = 0
    n_goals = len(goals)

    actions_sorted = actions.sort_values(["period_id", "time_seconds"])
    order = actions_sorted.index.tolist()

    for idx in order:
        period_id = actions.at[idx, "period_id"]
        time_seconds = actions.at[idx, "time_seconds"]
        while goal_idx < n_goals and (
            goals.at[goal_idx, "period_id"] < period_id
            or (
                goals.at[goal_idx, "period_id"] == period_id
                and goals.at[goal_idx, "time_seconds"] < time_seconds
            )
        ):
            if goals.at[goal_idx, "scoring_team_id"] == home_team_id:
                home_count += 1
            else:
                away_count += 1
            goal_idx += 1
        home_goals_before.append(home_count)
        away_goals_before.append(away_count)

    score_state = pd.DataFrame(
        {"home_goals_before": home_goals_before, "away_goals_before": away_goals_before},
        index=order,
    )
    actions = actions.join(score_state)

    def score_diff_for_row(row):
        if row["team_id"] == home_team_id:
            return int(row["home_goals_before"] - row["away_goals_before"])
        return int(row["away_goals_before"] - row["home_goals_before"])

    actions["score_diff"] = actions.apply(score_diff_for_row, axis=1)

    def classify(diff):
        if diff >= 2:
            return "winning_big"
        if diff == 1:
            return "winning_close"
        if diff == 0:
            return "level"
        if diff == -1:
            return "losing_close"
        return "losing_big"

    actions["game_state"] = actions["score_diff"].apply(classify)
    return actions.drop(columns=["home_goals_before", "away_goals_before"])


def process_tournament(competition_id, season_id, label):
    match_actions, team_names = load_match_actions(competition_id, season_id, label)

    model = VAEP(nb_prev_actions=3)
    feature_frames, label_frames = [], []
    for game_id, (game, actions) in match_actions.items():
        feature_frames.append(model.compute_features(game, actions))
        label_frames.append(model.compute_labels(game, actions))

    X = pd.concat(feature_frames).reset_index(drop=True)
    Y = pd.concat(label_frames).reset_index(drop=True)
    print(f"[{label}] Fitting VAEP model on {len(X)} actions...")
    model.fit(X, Y)

    tagged_frames = []
    for game_id, (game, actions) in match_actions.items():
        try:
            rated = model.rate(game, actions)
        except Exception as exc:
            print(f"[{label}] Failed to rate match {game_id}: {exc}")
            continue
        rated.index = actions.index
        actions = actions.join(rated)
        actions = tag_score_state(actions, int(game["home_team_id"]), int(game["away_team_id"]))

        actions["match_id"] = game_id
        actions["home_team"] = game["home_team"]
        actions["away_team"] = game["away_team"]
        actions["competition_stage"] = game["competition_stage"]
        actions["tournament_pressure"] = PRESSURE_SCALE[game["competition_stage"]]
        actions["team_name"] = actions["team_id"].map(team_names)
        tagged_frames.append(actions)

    full = pd.concat(tagged_frames, ignore_index=True)
    full.to_parquet(f"{RAW_DIR}/vaep_{label}.parquet")
    print(f"[{label}] Saved {len(full)} rated actions across {len(tagged_frames)} matches")


if __name__ == "__main__":
    for t in TOURNAMENTS:
        process_tournament(t["competition_id"], t["season_id"], t["label"])
