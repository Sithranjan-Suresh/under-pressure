const RESULT_COLOR = { W: 'var(--win)', D: 'var(--neutral)', L: 'var(--danger)' }

export default function TournamentTimeline({ timeline, teamName }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'flex', gap: 16, paddingBottom: 8, minWidth: 'max-content' }}>
        {timeline.map((match) => {
          const glow = match.tournament_pressure >= 4
          const teamWidth = match.team_vaep_avg != null ? Math.min(100, match.team_vaep_avg * 20000) : 0
          const oppWidth = match.opponent_vaep_avg != null ? Math.min(100, match.opponent_vaep_avg * 20000) : 0
          return (
            <div
              key={match.match_id}
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--bg-border)',
                borderRadius: 10,
                padding: 12,
                minWidth: 150,
                boxShadow: glow ? '0 0 16px var(--danger-dim)' : 'none',
              }}
            >
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{match.stage}</div>
              <div style={{ margin: '4px 0', fontFamily: 'var(--font-display)' }}>vs {match.opponent}</div>
              <span
                style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 12,
                  background: RESULT_COLOR[match.result],
                  color: 'var(--bg-base)',
                  fontWeight: 700,
                }}
              >
                {match.result}
              </span>
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{teamName}</div>
                <div style={{ background: 'var(--bg-elevated)', height: 6, borderRadius: 3 }}>
                  <div style={{ width: `${teamWidth}%`, height: '100%', background: 'var(--accent)', borderRadius: 3 }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{match.opponent}</div>
                <div style={{ background: 'var(--bg-elevated)', height: 6, borderRadius: 3 }}>
                  <div style={{ width: `${oppWidth}%`, height: '100%', background: 'var(--text-muted)', borderRadius: 3 }} />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
