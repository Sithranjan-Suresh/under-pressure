import { useEffect, useState } from 'react'
import { fetchLiveTeams } from '../lib/api'
import Flag from '../components/Flag'

export default function Live2026() {
  const [teams, setTeams] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchLiveTeams().then(setTeams).catch(setError)
  }, [])

  return (
    <div>
      <h1>
        FIFA World Cup 2026 — <span style={{ color: 'var(--accent)' }}>Live</span>
      </h1>

      <div
        style={{
          background: 'var(--neutral-dim)',
          border: '1px solid var(--neutral)',
          borderRadius: 10,
          padding: 16,
          margin: '16px 0',
        }}
      >
        2026 PRS is a results-based proxy (goals scored while trailing, normalized 0–100) — it is
        not VAEP-derived, and will be replaced by the full VAEP model once the tournament
        concludes. Do not compare these values directly to the 2018/2022 historical PRS scores.
      </div>

      {error && <p>Could not load live data.</p>}

      {!error && teams && teams.length === 0 && (
        <div style={{ background: 'var(--bg-surface)', borderRadius: 10, padding: 24 }}>
          Live data warming up — refreshes every 30 minutes once the tournament is underway.
        </div>
      )}

      {teams && teams.length > 0 && (
        <div>
          {teams
            .slice()
            .sort((a, b) => (b.prs ?? -1) - (a.prs ?? -1))
            .map((t, i) => (
              <div
                key={t.team_id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 0',
                  borderBottom: '1px solid var(--bg-border)',
                }}
              >
                <span style={{ color: 'var(--text-muted)', width: 24 }}>{i + 1}</span>
                <Flag teamName={t.team_name} width={20} />
                <span style={{ flex: 1 }}>{t.team_name}</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{t.prs ?? '—'}</span>
              </div>
            ))}
        </div>
      )}

      <p style={{ marginTop: 24 }}>
        <a href="/" style={{ color: 'var(--accent)' }}>
          Compare with 2022 historical results →
        </a>
      </p>
    </div>
  )
}
