export default function RegressionPanel({ regression }) {
  if (!regression) {
    return <p style={{ color: 'var(--text-muted)' }}>Regression results are unavailable right now.</p>
  }

  const primary = regression.primary_finding
  const prsAnalysis = regression.prs_analysis

  return (
    <div>
      <p
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: '1.6rem',
          color: 'var(--text-primary)',
        }}
      >
        {regression.headline}
      </p>

      {primary && (
        <div
          style={{
            display: 'flex',
            gap: 16,
            margin: '16px 0',
            flexWrap: 'wrap',
          }}
        >
          {Object.entries(primary.by_tournament || {}).map(([year, stats]) => (
            <div
              key={year}
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--accent-border)',
                borderRadius: 10,
                padding: 16,
                minWidth: 160,
              }}
            >
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>WC {year}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.8rem', color: 'var(--accent)' }}>
                {(stats.accuracy * 100).toFixed(1)}%
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                {stats.higher_vaep_wins} / {stats.decisive_matches} decisive matches
              </div>
            </div>
          ))}
        </div>
      )}

      {prsAnalysis && (
        <div style={{ marginTop: 24 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, textTransform: 'uppercase', marginBottom: 8 }}>
            Secondary / descriptive: PRS vs FIFA ranking as knockout-exit predictors
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--accent-border)',
                borderRadius: 10,
                padding: 16,
                flex: 1,
                minWidth: 200,
              }}
            >
              <div style={{ fontFamily: 'var(--font-display)' }}>PRS Model</div>
              <div style={{ fontFamily: 'var(--font-mono)' }}>
                pseudo-R²: {prsAnalysis.model_prs_only.pseudo_r2}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)' }}>AIC: {prsAnalysis.model_prs_only.aic}</div>
            </div>
            <div
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--bg-border)',
                borderRadius: 10,
                padding: 16,
                flex: 1,
                minWidth: 200,
              }}
            >
              <div style={{ fontFamily: 'var(--font-display)' }}>FIFA Ranking Model</div>
              <div style={{ fontFamily: 'var(--font-mono)' }}>
                pseudo-R²: {prsAnalysis.model_fifa_only.pseudo_r2}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)' }}>AIC: {prsAnalysis.model_fifa_only.aic}</div>
            </div>
          </div>

          <div style={{ overflowX: 'auto', marginTop: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th>Predictor</th>
                  <th>Odds Ratio</th>
                  <th>95% CI</th>
                  <th>P-value</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(prsAnalysis.model_combined.coefficients).map(([name, coef]) => (
                  <tr key={name} style={{ borderTop: '1px solid var(--bg-border)' }}>
                    <td style={{ padding: '6px 0' }}>{name}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{coef.odds_ratio}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>
                      [{coef.ci_lower}, {coef.ci_upper}]
                    </td>
                    <td
                      style={{
                        fontFamily: 'var(--font-mono)',
                        color: coef.p_value < 0.05 ? 'var(--win)' : 'var(--text-muted)',
                      }}
                    >
                      {coef.p_value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 12 }}>
            An odds ratio below 1 for PRS would mean teams with higher resilience scores are less
            likely to be eliminated in each knockout round. In this sample that relationship was
            not statistically significant.
          </p>
        </div>
      )}
    </div>
  )
}
