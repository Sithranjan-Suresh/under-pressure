"""Download StatsBomb open data for the four tournaments and save raw events/matches to disk."""

import pandas as pd
from statsbombpy import sb

RAW_DIR = "raw"

TOURNAMENTS = [
    {"competition_id": 43, "season_id": 106, "label": "wc2022", "role": "primary"},
    {"competition_id": 43, "season_id": 3, "label": "wc2018", "role": "primary"},
    {"competition_id": 223, "season_id": 282, "label": "copa2024", "role": "validation"},
    {"competition_id": 55, "season_id": 282, "label": "euro2024", "role": "validation"},
]


def download_tournament(competition_id, season_id, label):
    matches = sb.matches(competition_id=competition_id, season_id=season_id)
    matches.to_parquet(f"{RAW_DIR}/matches_{label}.parquet")

    total = len(matches)
    all_events = []
    for i, match_id in enumerate(matches["match_id"], start=1):
        print(f"[{label}] Downloading match {i}/{total}: {match_id}")
        try:
            events = sb.events(match_id=match_id)
        except Exception as exc:
            print(f"[{label}] Failed match {match_id}: {exc}")
            continue

        match_row = matches.loc[matches["match_id"] == match_id].iloc[0]
        events["match_id"] = match_id
        events["home_team"] = match_row["home_team"]
        events["away_team"] = match_row["away_team"]
        events["home_score"] = match_row["home_score"]
        events["away_score"] = match_row["away_score"]
        events["competition_stage"] = match_row["competition_stage"]
        all_events.append(events)

    all_events_df = pd.concat(all_events, ignore_index=True)
    all_events_df.to_parquet(f"{RAW_DIR}/events_{label}.parquet")
    print(f"[{label}] Saved {len(all_events_df)} events across {len(all_events)} matches")


if __name__ == "__main__":
    for tournament in TOURNAMENTS:
        download_tournament(
            tournament["competition_id"], tournament["season_id"], tournament["label"]
        )
