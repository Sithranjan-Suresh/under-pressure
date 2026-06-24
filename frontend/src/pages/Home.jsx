import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTeams } from '../hooks/useTeams'
import PressureScatter from '../components/PressureScatter'

const QUADRANT_COLORS = {
  elite: 'var(--elite)',
  pretenders: 'var(--pretenders)',
  grinders: 'var(--grinders)',
  fragile: 'var(--fragile)',
}

const QUADRANT_DESCRIPTIONS = {
  elite: 'High ceiling, holds it under pressure',
  pretenders: 'High ceiling, collapses under pressure',
  grinders: 'Lower ceiling, but resilient',
  fragile: 'Low ceiling, collapses under pressure',
}

export default function Home() {
  const { data: teams, loading, error } = useTeams()
  const [tournament, setTournament] = useState('All')
  const navigate = useNavigate()

  const filtered = useMemo(() => {
    if (!teams) return []
    if (tournament === 'All') return teams
    return teams.filter((t) => t.tournament === tournament)
  }, [teams, tournament])

  const prsMedian = useMemo(() => {
    if (!filtered.length) return null
    const values = filtered.map((t) => t.prs).filter((v) => v != null)
    if (!values.length) return null
    const sorted = [...values].sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length / 2)]
  }, [filtered])

  const ppiMedian = useMemo(() => {
    if (!filtered.length) return null
    const values = filtered.map((t) => t.ppi).filter((v) => v != null)
    if (!values.length) return null
    const sorted = [...values].sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length / 2)]
  }, [filtered])

  const goToTeam = (team) => navigate(`/team/${team.team_id}`)

  if (error) {
    return (
      <div>
        <p>Something went wrong loading team data.</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    )
  }

  return (
    <div>
      <h1>
        Who holds their game <span style={{ color: 'var(--accent)' }}>under pressure</span>?
      </h1>
      <p style={{ color: 'var(--text-muted)', maxWidth: 640 }}>
        Every team's possession value, decomposed by score state. See who elevates when behind,
        and who collapses.
      </p>

      <div style={{ margin: '16px 0' }}>
        {['All', '2022', '2018'].map((opt) => (
          <button
            key={opt}
            onClick={() => setTournament(opt)}
            style={{
              marginRight: 8,
              padding: '6px 14px',
              borderRadius: 6,
              border: tournament === opt ? '1px solid var(--accent)' : '1px solid var(--bg-border)',
              background: tournament === opt ? 'var(--accent-dim)' : 'var(--bg-surface)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
            }}
          >
            {opt}
          </button>
        ))}
      </div>

      {loading || !teams ? (
        <div style={{ height: 480, background: 'var(--bg-surface)', borderRadius: 10 }} />
      ) : (
        <PressureScatter
          teams={filtered}
          onTeamClick={goToTeam}
          prsMedian={prsMedian}
          ppiMedian={ppiMedian}
          selectedTeamId={null}
        />
      )}

      <div style={{ display: 'flex', gap: 16, margin: '16px 0', flexWrap: 'wrap' }}>
        {Object.entries(QUADRANT_DESCRIPTIONS).map(([q, desc]) => (
          <div key={q} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: QUADRANT_COLORS[q],
                display: 'inline-block',
              }}
            />
            <span style={{ textTransform: 'capitalize' }}>{q}</span>
            <span style={{ color: 'var(--text-muted)' }}>— {desc}</span>
          </div>
        ))}
      </div>

      <h2 style={{ marginTop: 32 }}>Leaderboard</h2>
      <div>
        {!loading &&
          filtered
            .slice()
            .sort((a, b) => (b.prs ?? -1) - (a.prs ?? -1))
            .map((t, i) => (
              <div
                key={t.team_id}
                onClick={() => goToTeam(t)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 0',
                  borderBottom: '1px solid var(--bg-border)',
                  cursor: 'pointer',
                }}
              >
                <span style={{ color: 'var(--text-muted)', width: 24 }}>{i + 1}</span>
                <span>{t.flag_emoji}</span>
                <span style={{ flex: 1 }}>
                  {t.team_name} <span style={{ color: 'var(--text-muted)' }}>({t.tournament})</span>
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    color: t.quadrant ? QUADRANT_COLORS[t.quadrant] : 'var(--text-faint)',
                  }}
                >
                  {t.prs != null ? t.prs.toFixed(1) : '—'}
                </span>
                {t.quadrant && (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                    {t.quadrant}
                  </span>
                )}
              </div>
            ))}
      </div>
    </div>
  )
}
