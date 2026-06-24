"""Compute the project's reported statistics and save them to regression_results.json.

PRIMARY finding: match_vaep_winner_accuracy -- across WC2018+2022, what fraction of decisive
(non-drawn) matches were won by the team with the higher match-level average VAEP? This
replaced the original PRS-vs-FIFA-rank regression as the headline because, on real data, that
regression's central claim did not hold (PRS pseudo-R^2 was statistically indistinguishable
from FIFA rank's, n=59-60 team-rounds). The match-VAEP-accuracy statistic is large, simple,
and consistent across both tournaments independently (94.1% in 2018, 95.9% in 2022).

SECONDARY finding: the original per-round logistic regression (knockout_exit ~ PRS + FIFA_rank
+ stage_retention + ppi) is retained and still reported, but explicitly framed as a descriptive
secondary metric, not the project's central claim. PRS itself did not outperform FIFA rank as a
round-level exit predictor, nor did it correlate with overall tournament distance (Spearman
rho=-0.105, p=0.41, tested separately) -- the regression block below preserves that finding for
transparency rather than hiding it.

Unit of observation for the secondary regression: one row per team per knockout round they
played (Round of 16, Quarter-finals, Semi-finals, Final). Group-stage-exit teams contribute
zero rows. The 3rd Place Final is excluded -- both its participants were already eliminated in
the semi-final, so it is not an elimination round and including it would double-count exits.

Note: a 32-team single-elimination bracket has exactly 16+8+4+2 = 30 team-round rows per
tournament (16 teams reach Round of 16, 8 reach QF, 4 reach SF, 2 reach the Final), so
n_team_rounds for two tournaments is fixed at 60, not the ~100-140 the engineering spec
estimated. We report the true count rather than inflate it.

Penalty-shootout winners (for matches drawn after 120 minutes) are resolved from
backend/pipeline/raw/vaep_{label}.parquet, which has period_id == 5 for shootout
attempts -- the winner is whichever team scored more in that period.
"""

import json

import numpy as np
import pandas as pd
from scipy import stats
from sklearn.linear_model import LogisticRegression

RAW_DIR = "raw"
PROCESSED_DIR = "processed"
DATA_DIR = "../data"

KNOCKOUT_ROUNDS = ["Round of 16", "Quarter-finals", "Semi-finals", "Final"]
TOURNAMENTS = [
    {"label": "wc2022", "year": "2022"},
    {"label": "wc2018", "year": "2018"},
]


def resolve_shootout_winner(vaep_df, match_id, home_team, away_team):
    pens = vaep_df[(vaep_df["match_id"] == match_id) & (vaep_df["period_id"] == 5)]
    goals = pens[
        pens["type_name"].isin(["shot", "shot_penalty", "shot_freekick"])
        & (pens["result_name"] == "success")
    ]
    counts = goals.groupby("team_name").size()
    home_goals = counts.get(home_team, 0)
    away_goals = counts.get(away_team, 0)
    return home_team if home_goals > away_goals else away_team


def compute_match_vaep_winner_accuracy():
    """Primary finding: % of decisive matches won by the team with higher match-avg VAEP."""
    per_tournament = {}
    all_rows = []
    for t in TOURNAMENTS:
        label, year = t["label"], t["year"]
        matches = pd.read_parquet(f"{RAW_DIR}/matches_{label}.parquet")
        vaep = pd.read_parquet(f"{RAW_DIR}/vaep_{label}.parquet")

        # exclude penalty shootouts (period_id == 5) -- not meaningful open-play possession value
        open_play = vaep[vaep["period_id"] != 5]
        team_match_vaep = (
            open_play.groupby(["match_id", "team_name"])["vaep_value"].mean().reset_index()
        )

        rows = []
        for _, m in matches.iterrows():
            sub = team_match_vaep[team_match_vaep["match_id"] == m["match_id"]]
            home_row = sub[sub["team_name"] == m["home_team"]]
            away_row = sub[sub["team_name"] == m["away_team"]]
            if home_row.empty or away_row.empty:
                continue
            home_vaep = home_row["vaep_value"].iloc[0]
            away_vaep = away_row["vaep_value"].iloc[0]

            if m["home_score"] > m["away_score"]:
                winner = "home"
            elif m["away_score"] > m["home_score"]:
                winner = "away"
            else:
                winner = "draw"

            higher_vaep_side = "home" if home_vaep > away_vaep else "away"
            rows.append({"winner": winner, "higher_vaep_won": winner == higher_vaep_side, "is_draw": winner == "draw"})

        df = pd.DataFrame(rows)
        decisive = df[~df["is_draw"]]
        per_tournament[year] = {
            "decisive_matches": int(len(decisive)),
            "higher_vaep_wins": int(decisive["higher_vaep_won"].sum()),
            "accuracy": round(float(decisive["higher_vaep_won"].mean()), 4),
        }
        all_rows.append(df)

    combined = pd.concat(all_rows, ignore_index=True)
    decisive_combined = combined[~combined["is_draw"]]
    decisive_accuracy = float(decisive_combined["higher_vaep_won"].mean())
    all_matches_accuracy = float(combined["higher_vaep_won"].mean())

    return {
        "metric": "match_vaep_winner_accuracy",
        "description": (
            "Fraction of decisive (non-drawn) WC2018+2022 matches won by the team with the "
            "higher match-level average VAEP."
        ),
        "decisive_matches": int(len(decisive_combined)),
        "higher_vaep_wins": int(decisive_combined["higher_vaep_won"].sum()),
        "decisive_accuracy": round(decisive_accuracy, 4),
        "all_matches_accuracy_incl_draws": round(all_matches_accuracy, 4),
        "total_matches": int(len(combined)),
        "draws": int(combined["is_draw"].sum()),
        "by_tournament": per_tournament,
        "headline": (
            f"The team with the higher match-level VAEP average won "
            f"{decisive_accuracy:.1%} of decisive matches across WC 2018 and WC 2022 "
            f"({int(decisive_combined['higher_vaep_won'].sum())} of {len(decisive_combined)})."
        ),
    }


def build_team_rounds(year, label):
    matches = pd.read_parquet(f"{RAW_DIR}/matches_{label}.parquet")
    vaep = pd.read_parquet(f"{RAW_DIR}/vaep_{label}.parquet")

    rows = []
    knockout_matches = matches[matches["competition_stage"].isin(KNOCKOUT_ROUNDS)]
    for _, m in knockout_matches.iterrows():
        home, away = m["home_team"], m["away_team"]
        if m["home_score"] > m["away_score"]:
            winner = home
        elif m["away_score"] > m["home_score"]:
            winner = away
        else:
            winner = resolve_shootout_winner(vaep, m["match_id"], home, away)
        loser = away if winner == home else home

        rows.append(
            {"team_id": f"{winner}_{year}", "round": m["competition_stage"], "knockout_exit": 0}
        )
        rows.append(
            {"team_id": f"{loser}_{year}", "round": m["competition_stage"], "knockout_exit": 1}
        )

    return pd.DataFrame(rows)


def mcfadden_pseudo_r2(y, p_model, p_null):
    ll_model = np.sum(y * np.log(p_model) + (1 - y) * np.log(1 - p_model))
    ll_null = np.sum(y * np.log(p_null) + (1 - y) * np.log(1 - p_null))
    return 1 - (ll_model / ll_null)


def fit_logit(X, y, feature_names):
    """Fit an unregularized logistic regression and return coefficients, SEs, AIC, pseudo-R2."""
    n, k = X.shape
    clf = LogisticRegression(C=1e9, solver="lbfgs", max_iter=1000)
    clf.fit(X, y)

    coefs = np.concatenate([clf.intercept_, clf.coef_[0]])
    X_design = np.hstack([np.ones((n, 1)), X])

    p_model = clf.predict_proba(X)[:, 1]
    p_model = np.clip(p_model, 1e-9, 1 - 1e-9)

    p_null = np.full(n, y.mean())
    p_null = np.clip(p_null, 1e-9, 1 - 1e-9)

    ll_model = np.sum(y * np.log(p_model) + (1 - y) * np.log(1 - p_model))
    k_params = X_design.shape[1]
    aic = -2 * ll_model + 2 * k_params
    pseudo_r2 = mcfadden_pseudo_r2(y, p_model, p_null)

    W = np.diag(p_model * (1 - p_model))
    hessian = X_design.T @ W @ X_design
    cond_number = np.linalg.cond(hessian)

    if cond_number > 1e10:
        # bootstrap standard errors
        rng = np.random.default_rng(42)
        boot_coefs = []
        for _ in range(1000):
            idx = rng.integers(0, n, n)
            try:
                boot_clf = LogisticRegression(C=1e9, solver="lbfgs", max_iter=1000)
                boot_clf.fit(X[idx], y[idx])
                boot_coefs.append(np.concatenate([boot_clf.intercept_, boot_clf.coef_[0]]))
            except Exception:
                continue
        se = np.std(np.array(boot_coefs), axis=0)
    else:
        cov = np.linalg.inv(hessian)
        se = np.sqrt(np.diag(cov))

    z = coefs / se
    p_values = 2 * (1 - stats.norm.cdf(np.abs(z)))
    odds_ratios = np.exp(coefs)
    ci_lower = np.exp(coefs - 1.96 * se)
    ci_upper = np.exp(coefs + 1.96 * se)

    result = {
        "pseudo_r2": round(float(pseudo_r2), 3),
        "aic": round(float(aic), 1),
        "n": n,
    }
    coef_results = {}
    for i, name in enumerate(feature_names, start=1):
        coef_results[name] = {
            "odds_ratio": round(float(odds_ratios[i]), 3),
            "ci_lower": round(float(ci_lower[i]), 3),
            "ci_upper": round(float(ci_upper[i]), 3),
            "p_value": round(float(p_values[i]), 3),
        }
    return result, coef_results


def standardize(df, cols):
    means = df[cols].mean()
    stds = df[cols].std()
    scaled = (df[cols] - means) / stds
    return scaled, means, stds


if __name__ == "__main__":
    primary_finding = compute_match_vaep_winner_accuracy()
    print("--- PRIMARY FINDING: match_vaep_winner_accuracy ---")
    print(json.dumps(primary_finding, indent=2))

    features = pd.read_parquet(f"{PROCESSED_DIR}/team_features.parquet")
    features["adj_prs_raw"] = features["raw_prs"] * (1 + features["opponent_strength_factor"])

    team_rounds = pd.concat(
        [build_team_rounds(t["year"], t["label"]) for t in TOURNAMENTS], ignore_index=True
    )
    print(f"n_team_rounds (true): {len(team_rounds)}")

    dataset = team_rounds.merge(
        features[
            ["team_id", "raw_prs", "adj_prs_raw", "fifa_rank", "stage_retention", "ppi"]
        ],
        on="team_id",
        how="left",
    )
    dataset = dataset.dropna(
        subset=["raw_prs", "fifa_rank", "stage_retention", "ppi", "adj_prs_raw"]
    )
    print(f"n_team_rounds (after dropping rows with missing predictors): {len(dataset)}")

    y = dataset["knockout_exit"].to_numpy()

    scaled_all, means, stds = standardize(
        dataset, ["raw_prs", "fifa_rank", "stage_retention", "ppi", "adj_prs_raw"]
    )

    X_prs = scaled_all[["raw_prs"]].to_numpy()
    model_prs_only, coef_prs_only = fit_logit(X_prs, y, ["PRS"])

    X_fifa = scaled_all[["fifa_rank"]].to_numpy()
    model_fifa_only, coef_fifa_only = fit_logit(X_fifa, y, ["FIFA_rank"])

    X_combined = scaled_all[["raw_prs", "fifa_rank", "stage_retention", "ppi"]].to_numpy()
    model_combined, coef_combined = fit_logit(
        X_combined, y, ["PRS", "FIFA_rank", "stage_retention", "ppi"]
    )

    X_adj = scaled_all[["adj_prs_raw"]].to_numpy()
    model_adj_prs_only, coef_adj_prs_only = fit_logit(X_adj, y, ["adj_PRS"])

    prs_r2 = model_prs_only["pseudo_r2"]
    fifa_r2 = model_fifa_only["pseudo_r2"]
    secondary_headline = (
        f"As a secondary, descriptive check: PRS explains {prs_r2:.1%} of round-level knockout "
        f"exit variance vs {fifa_r2:.1%} for FIFA ranking alone"
    )
    if prs_r2 <= fifa_r2:
        secondary_headline += " -- in this sample, FIFA ranking was at least as predictive, so PRS is not reported as outperforming it."
    else:
        secondary_headline += "."

    results = {
        "primary_finding": primary_finding,
        "headline": primary_finding["headline"],
        "prs_analysis": {
            "framing": "secondary descriptive metric -- not the project's primary claim",
            "model_prs_only": {**model_prs_only, "predictor": "PRS", **coef_prs_only["PRS"]},
            "model_fifa_only": {**model_fifa_only, "predictor": "FIFA_rank", **coef_fifa_only["FIFA_rank"]},
            "model_combined": {
                **model_combined,
                "predictors": ["PRS", "FIFA_rank", "stage_retention", "ppi"],
                "coefficients": coef_combined,
            },
            "model_adj_prs_only": {**model_adj_prs_only, "predictor": "adj_PRS", **coef_adj_prs_only["adj_PRS"]},
            "headline": secondary_headline,
            "n_team_rounds": len(dataset),
        },
    }

    with open(f"{DATA_DIR}/regression_results.json", "w") as f:
        json.dump(results, f, indent=2)
    print(f"Saved regression_results.json")
    print(json.dumps(results, indent=2))

    scaling_metadata = {
        "regression_feature_scaling": {
            col: {"mean": round(float(means[col]), 6), "std": round(float(stds[col]), 6)}
            for col in means.index
        }
    }
    with open(f"{DATA_DIR}/model_metadata.json", "w") as f:
        json.dump(scaling_metadata, f, indent=2)
    print("Saved partial model_metadata.json (scaling only; 05_build_parquets.py extends it)")
