const QUADRANT_COLORS = {
  elite: 'var(--elite)',
  pretenders: 'var(--pretenders)',
  grinders: 'var(--grinders)',
  fragile: 'var(--fragile)',
}

export default function ResilienceCard({ prs, adjPrs, prsRank, totalTeams, quadrant }) {
  const color = quadrant ? QUADRANT_COLORS[quadrant] : 'var(--text-faint)'

  return (
    <div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '5rem', color, lineHeight: 1 }}>
        {prs != null ? prs.toFixed(1) : '—'}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '0.75rem',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          letterSpacing: 1,
        }}
      >
        Pressure Resilience Score
      </div>
      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 8 }}>
        {prs != null ? `Ranked #${prsRank} of ${totalTeams} teams` : 'Insufficient data'}
      </div>
      {quadrant && (
        <span
          style={{
            display: 'inline-block',
            marginTop: 8,
            padding: '4px 10px',
            borderRadius: 999,
            fontSize: 12,
            background: `${color}26`,
            border: `1px solid ${color}`,
            color,
            textTransform: 'capitalize',
          }}
        >
          {quadrant}
        </span>
      )}
      {adjPrs != null && (
        <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-muted)' }} title="Adjusted for strength of opposition faced.">
          Opponent-adjusted: {adjPrs.toFixed(1)}
        </div>
      )}
    </div>
  )
}
