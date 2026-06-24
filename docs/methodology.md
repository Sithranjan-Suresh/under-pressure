# Methodology

## The question

Does a team's in-game possession value — not just whether they win, but how much dangerous,
goal-relevant play they generate — actually predict who wins a match, more reliably than we'd
expect from chance? And separately: do some teams elevate that quality of play specifically when
they're behind on the scoreboard, and does that "pressure resilience" predict how far they go in
a tournament?

## The data

This project uses [StatsBomb](https://statsbomb.com/) Open Data, a free, public release of
full event-level data for major tournaments. We use the complete event data for the 2018 and
2022 FIFA World Cups (64 matches each) as the primary dataset, and the 2024 Copa América and
2024 UEFA EURO as smaller, secondary datasets used only for an exploratory cross-tournament
check, never mixed into the primary model.

## The metric

Every on-ball action in a match — a pass, a dribble, a tackle, a shot — is assigned a value
using **VAEP** (Value of Actions by Estimating Probabilities), an open-source possession-value
model from the `socceraction` library. VAEP looks at how much an action changes a team's
probability of scoring and conceding in the next several actions, and nets the two into a
single number per action, in expected-goal-like units. Averaged across a match or a tournament,
it answers: how much dangerous, productive play did a team actually generate, independent of
whether the ball happened to go in?

We also tag every action with the score state at the moment it happened (winning, level, or
losing, by how much) and the tournament stage it occurred in, which lets us ask whether a
team's average VAEP output changes when they're behind — that's the basis of the **Pressure
Resilience Score (PRS)**.

## The finding

The project's primary, validated finding: **the team with the higher match-level average VAEP
won 95.0% of decisive (non-drawn) matches across WC 2018 and WC 2022** (95 of 100 decisive
matches; 94.1% in 2018, 95.9% in 2022, independently consistent across both tournaments). In
plain terms, the team that genuinely outplayed its opponent in terms of dangerous possession
value won the match the vast majority of the time it wasn't a draw — match-level VAEP is a
strong, simple, well-validated signal of who actually controlled a game.

PRS, the secondary metric this project also reports, asks a narrower question: among teams who
fall behind, who keeps generating value anyway? We report it as a descriptive lens on individual
teams (visible per-team on this site), but we tested it rigorously as a *predictor* of tournament
outcomes and it did not hold up: in a logistic regression of knockout-round elimination on PRS,
FIFA ranking, stage retention, and peak performance, PRS explained about 2.1% of the variance in
who got eliminated each round, no better than FIFA ranking's 2.8% — and neither was a
statistically significant predictor at this sample size. We are reporting that honestly rather
than overselling PRS as something it isn't. The match-VAEP-accuracy finding above is the
project's central, defensible claim.

## Limitations

The primary dataset spans 64 teams across two tournaments — large enough for the match-level
analysis (128 matches), but small for any analysis at the team-tournament or round level, which
makes weaker effects (like PRS's relationship to elimination) hard to detect even if real. VAEP
itself does not fully capture goalkeeping actions or all set-piece nuance, and it is trained
per-tournament here rather than on a large external corpus, which adds some noise to individual
action ratings. The Live 2026 tab uses a much cruder, results-only proxy for resilience (goals
scored while trailing) — it is not VAEP-derived and should not be compared directly to the
historical PRS values.

## Data and code

Match and event data: StatsBomb Open Data (https://github.com/statsbomb/open-data), used under
their open data terms. Possession-value model: `socceraction` (VAEP). Pipeline code, model
training, and full source available in this project's GitHub repository.
