import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchLiveTeams } from '../lib/api'
import Flag from '../components/Flag'

export default function Live2026() {
  const [teams, setTeams] = useState(null)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchLiveTeams().then(setTeams).catch(setError)
  }, [])

  const filtered = useMemo(() => {
    if (!teams) return []
    if (!search.trim()) return teams
    const q = search.trim().toLowerCase()
    return teams.filter((t) => t.team_name.toLowerCase().includes(q))
  }, [teams, search])

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 style={{ margin: 0 }}>FIFA World Cup 2026 — Live</h1>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            borderRadius: 999,
            background: 'rgba(239,68,68,0.12)',
            border: '1px solid var(--accent-red)',
            color: 'var(--accent-red)',
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--accent-red)',
              animation: 'pulse-dot 1.4s ease-in-out infinite',
            }}
          />
          LIVE
        </span>
      </div>

      <Link
        to="/home"
        style={{
          display: 'inline-block',
          marginTop: 16,
          padding: '10px 20px',
          borderRadius: 8,
          background: 'var(--accent-teal)',
          color: 'var(--bg-primary)',
          fontWeight: 600,
          textDecoration: 'none',
          fontSize: 14,
        }}
      >
        Compare with 2022 historical results →
      </Link>

      <div
        className="card"
        style={{
          borderLeft: '3px solid var(--accent-amber)',
          margin: '20px 0',
          padding: '16px 18px',
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
        }}
      >
        <span style={{ color: 'var(--accent-amber)', fontSize: 18, lineHeight: 1 }}>ⓘ</span>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
          2026 PRS is a results-based proxy, not VAEP-derived: for each match we compare the
          half-time score to the full-time score, and credit a team with every second-half goal
          scored in matches where they were behind at half time, normalized 0–100. It can only see
          comebacks that span the half-time break — a team that fell behind and recovered entirely
          within a single half won't be credited, because the live data feed only gives
          half-time/full-time scores, not a goal-by-goal timeline. It will be replaced by the full
          VAEP model once the tournament concludes.{' '}
          <strong style={{ color: 'var(--text-primary)' }}>
            Do not compare these values directly to the 2018/2022 historical PRS scores.
          </strong>
        </p>
      </div>

      {error && <p>Could not load live data.</p>}

      {!error && teams && teams.length === 0 && (
        <div className="card" style={{ padding: 24, color: 'var(--text-secondary)' }}>
          Live data warming up — refreshes every 30 minutes once the tournament is underway.
        </div>
      )}

      {teams && teams.length > 0 && (
        <>
          <input
            type="text"
            placeholder="Search team..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              fontFamily: 'inherit',
              fontSize: 14,
              minWidth: 200,
              margin: '4px 0 16px',
            }}
          />
          <div>
            {filtered
              .slice()
              .sort((a, b) => (b.prs ?? -1) - (a.prs ?? -1))
              .map((t, i) => {
                const hasData = t.prs != null && t.prs !== 0
                return (
                  <div
                    key={t.team_id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 8px',
                      borderBottom: '1px solid var(--border)',
                      opacity: hasData ? 1 : 0.45,
                    }}
                  >
                    <span style={{ color: 'var(--text-secondary)', width: 24 }} className="mono">
                      {i + 1}
                    </span>
                    <Flag teamName={t.team_name} width={20} />
                    <span style={{ flex: 1 }}>{t.team_name}</span>
                    <span className="mono" style={{ color: hasData ? 'var(--accent-teal)' : 'var(--text-faint)' }}>
                      {hasData ? t.prs.toFixed(1) : 'No data yet'}
                    </span>
                  </div>
                )
              })}
            {filtered.length === 0 && (
              <p style={{ color: 'var(--text-secondary)', padding: '20px 0' }}>No teams match that search.</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
