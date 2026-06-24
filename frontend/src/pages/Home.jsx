import { useEffect, useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useTeams } from '../hooks/useTeams'
import { fetchRegression } from '../lib/api'
import PressureScatter from '../components/PressureScatter'
import Flag from '../components/Flag'

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

function HeroStat() {
  const [primary, setPrimary] = useState(null)

  useEffect(() => {
    fetchRegression()
      .then((r) => setPrimary(r.primary_finding))
      .catch(() => setPrimary(null))
  }, [])

  const pct = primary ? Math.round(primary.decisive_accuracy * 1000) / 10 : null

  return (
    <div
      style={{
        position: 'relative',
        borderRadius: 20,
        padding: '56px 40px',
        margin: '28px 0 40px',
        background:
          'radial-gradient(circle at 15% 20%, var(--accent-dim), transparent 55%), radial-gradient(circle at 85% 80%, rgba(54,245,168,0.10), transparent 55%), var(--bg-surface)',
        border: '1px solid var(--bg-border)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'clamp(64px, 12vw, 132px)',
          lineHeight: 1,
          fontWeight: 400,
          background: 'linear-gradient(135deg, var(--accent), var(--win))',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
        }}
      >
        {pct != null ? `${pct}%` : '—'}
      </div>
      <p
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: 'clamp(20px, 3vw, 30px)',
          maxWidth: 720,
          margin: '8px 0 16px',
          color: 'var(--text-primary)',
        }}
      >
        The team that generated more possession value won {pct != null ? `${pct}%` : 'most'} of
        decisive World Cup matches.
      </p>
      <p
        style={{
          fontSize: 16,
          color: 'var(--text-muted)',
          maxWidth: 560,
          margin: 0,
          lineHeight: 1.6,
        }}
      >
        Not the higher-ranked team. Not the favorite.
        <br />
        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
          The team that outplayed them.
        </span>
      </p>
      <div style={{ marginTop: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Link
          to="/matches"
          style={{
            display: 'inline-block',
            padding: '10px 20px',
            borderRadius: 8,
            background: 'var(--accent)',
            color: 'var(--bg-base)',
            fontWeight: 600,
            textDecoration: 'none',
            fontSize: 14,
          }}
        >
          See the matches that prove it →
        </Link>
        <Link
          to="/methodology"
          style={{
            display: 'inline-block',
            padding: '10px 20px',
            borderRadius: 8,
            border: '1px solid var(--bg-border)',
            color: 'var(--text-primary)',
            textDecoration: 'none',
            fontSize: 14,
          }}
        >
          Read the methodology
        </Link>
      </div>
    </div>
  )
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
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 'clamp(28px, 4vw, 44px)', lineHeight: 1.15 }}>
        Who holds their game <span style={{ color: 'var(--accent)' }}>under pressure</span>?
      </h1>
      <p style={{ color: 'var(--text-muted)', maxWidth: 640, fontSize: 16 }}>
        UNDER PRESSURE decomposes every World Cup team's possession value by score state — who
        elevates when behind, and who collapses.
      </p>

      <HeroStat />

      <div
        style={{
          background: 'var(--accent-dim)',
          border: '1px solid var(--accent-border)',
          borderRadius: 8,
          padding: '10px 14px',
          margin: '12px 0',
          fontSize: 13,
          color: 'var(--text-primary)',
          maxWidth: 720,
        }}
      >
        <strong>PRS (below) measures who generates value while losing — not who wins.</strong> A
        team that rarely trailed (because they were usually ahead or level) can rank low here even
        if they won the tournament — that's a small-sample / low-opportunity effect, not the model
        breaking. Look for the ⚠ markers below.
      </div>

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
              transition: 'border-color 0.15s, background 0.15s',
            }}
          >
            {opt}
          </button>
        ))}
      </div>

      {loading || !teams ? (
        <div
          style={{
            height: 480,
            background:
              'linear-gradient(90deg, var(--bg-surface) 25%, var(--bg-elevated) 50%, var(--bg-surface) 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.4s infinite',
            borderRadius: 10,
          }}
        />
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
                  padding: '10px 4px',
                  borderRadius: 6,
                  borderBottom: '1px solid var(--bg-border)',
                  cursor: 'pointer',
                  transition: 'background 0.12s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ color: 'var(--text-muted)', width: 24 }}>{i + 1}</span>
                <Flag teamName={t.team_name} width={20} />
                <span style={{ flex: 1 }}>
                  {t.team_name} <span style={{ color: 'var(--text-muted)' }}>({t.tournament})</span>
                  {t.low_sample_warning && (
                    <span
                      title={`Small losing-state sample (${t.losing_sample_size} actions) — PRS here is noisier than usual.`}
                      style={{ marginLeft: 6, color: 'var(--neutral)', cursor: 'help' }}
                    >
                      ⚠
                    </span>
                  )}
                  {t.surprising_result_note && (
                    <span
                      title={t.surprising_result_note}
                      style={{ marginLeft: 6, color: 'var(--accent)', cursor: 'help' }}
                    >
                      ⓘ
                    </span>
                  )}
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
