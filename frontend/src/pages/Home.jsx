import { useEffect, useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useTeams } from '../hooks/useTeams'
import { fetchRegression } from '../lib/api'
import PressureScatter from '../components/PressureScatter'
import Flag from '../components/Flag'
import AnimatedNumber from '../components/AnimatedNumber'

const QUADRANT_COLORS = {
  elite: 'var(--elite)',
  pretenders: 'var(--pretenders)',
  grinders: 'var(--grinders)',
  fragile: 'var(--fragile)',
}

const QUADRANT_DESCRIPTIONS = {
  elite: 'High possession quality AND holds it under pressure. The profile of a team built to go deep.',
  pretenders: 'High possession quality, but it doesn’t hold up when behind. Good on paper, shakier in a deficit.',
  grinders: 'Lower baseline quality, but resilient — output holds or rises when chasing a game. Dangerous when behind.',
  fragile: 'Lower baseline quality and it drops further under pressure. The profile most likely to fold.',
}

function QuadrantPill({ quadrant }) {
  if (!quadrant) return null
  const color = QUADRANT_COLORS[quadrant]
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'capitalize',
        background: `${color}22`,
        color,
        border: `1px solid ${color}55`,
      }}
    >
      {quadrant}
    </span>
  )
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
      className="card"
      style={{
        position: 'relative',
        borderRadius: 12,
        padding: '56px 40px',
        margin: '28px 0 40px',
        background:
          'radial-gradient(circle at 15% 20%, var(--accent-dim), transparent 55%), radial-gradient(circle at 85% 80%, rgba(59,130,246,0.08), transparent 55%), var(--bg-secondary)',
        overflow: 'hidden',
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 'clamp(80px, 12vw, 140px)',
          lineHeight: 1,
          fontWeight: 700,
          color: 'var(--accent-teal)',
        }}
      >
        <AnimatedNumber value={pct} duration={800} decimals={1} suffix="%" />
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
          color: 'var(--text-secondary)',
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
            background: 'var(--accent-teal)',
            color: 'var(--bg-primary)',
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
            border: '1px solid var(--border)',
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

function ActionableInsight({ teams }) {
  const insight = useMemo(() => {
    const byQuadrant = {}
    for (const t of teams) {
      if (!t.quadrant) continue
      byQuadrant[t.quadrant] = byQuadrant[t.quadrant] || { advanced: 0, total: 0 }
      byQuadrant[t.quadrant].total += 1
      if (t.tournament_result && t.tournament_result !== 'Group Stage') {
        byQuadrant[t.quadrant].advanced += 1
      }
    }
    const rates = Object.entries(byQuadrant)
      .filter(([, v]) => v.total > 0)
      .map(([q, v]) => ({ quadrant: q, rate: v.advanced / v.total, advanced: v.advanced, total: v.total }))
    if (rates.length < 2) return null
    rates.sort((a, b) => b.rate - a.rate)
    const top = rates[0]
    const bottom = rates[rates.length - 1]
    if (bottom.rate === 0) return null
    return { top, bottom, ratio: top.rate / bottom.rate }
  }, [teams])

  if (!insight) return null

  return (
    <div
      className="card"
      style={{
        borderLeft: '3px solid var(--accent-teal)',
        margin: '16px 0',
        fontSize: 14,
      }}
    >
      <strong style={{ textTransform: 'capitalize' }}>{insight.top.quadrant}</strong> teams
      advance past the group stage at{' '}
      <strong className="mono">{insight.ratio.toFixed(1)}×</strong> the rate of{' '}
      <strong style={{ textTransform: 'capitalize' }}>{insight.bottom.quadrant}</strong> teams (
      {(insight.top.rate * 100).toFixed(0)}% vs {(insight.bottom.rate * 100).toFixed(0)}%).
    </div>
  )
}

export default function Home() {
  const { data: teams, loading, error } = useTeams()
  const [tournament, setTournament] = useState('All')
  const [quadrantFilter, setQuadrantFilter] = useState('All')
  const [search, setSearch] = useState('')
  const navigate = useNavigate()

  const tournamentFiltered = useMemo(() => {
    if (!teams) return []
    if (tournament === 'All') return teams
    return teams.filter((t) => t.tournament === tournament)
  }, [teams, tournament])

  const filtered = useMemo(() => {
    let list = tournamentFiltered
    if (quadrantFilter !== 'All') {
      list = list.filter((t) => t.quadrant === quadrantFilter.toLowerCase())
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((t) => t.team_name.toLowerCase().includes(q))
    }
    return list
  }, [tournamentFiltered, quadrantFilter, search])

  const median = (values) => {
    if (!values.length) return null
    const sorted = [...values].sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length / 2)]
  }

  const prsMedian = useMemo(
    () => median(tournamentFiltered.map((t) => t.prs).filter((v) => v != null)),
    [tournamentFiltered]
  )
  const ppiMedian = useMemo(
    () => median(tournamentFiltered.map((t) => t.ppi).filter((v) => v != null)),
    [tournamentFiltered]
  )
  const ppiMin = useMemo(() => {
    const values = tournamentFiltered.map((t) => t.ppi).filter((v) => v != null)
    return values.length ? Math.min(...values) : null
  }, [tournamentFiltered])
  const ppiMax = useMemo(() => {
    const values = tournamentFiltered.map((t) => t.ppi).filter((v) => v != null)
    return values.length ? Math.max(...values) : null
  }, [tournamentFiltered])

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
        Who holds their game <span style={{ color: 'var(--accent-teal)' }}>under pressure</span>?
      </h1>
      <p style={{ color: 'var(--text-secondary)', maxWidth: 640, fontSize: 16 }}>
        UNDER PRESSURE decomposes every World Cup team's possession value by score state — who
        elevates when behind, and who collapses.
      </p>

      <HeroStat />

      <div
        className="card"
        style={{
          borderLeft: '3px solid var(--accent-teal)',
          margin: '12px 0',
          fontSize: 13,
          maxWidth: 720,
        }}
      >
        <strong>PRS (below) measures who generates value while losing — not who wins.</strong> A
        team that rarely trailed (because they were usually ahead or level) can rank low here even
        if they won the tournament — that's a small-sample / low-opportunity effect, not the model
        breaking. Look for the ⚠ markers below.
      </div>

      <div style={{ margin: '16px 0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {['All', '2022', '2018'].map((opt) => (
          <button
            key={opt}
            onClick={() => setTournament(opt)}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: tournament === opt ? '1px solid var(--accent-teal)' : '1px solid var(--border)',
              background: tournament === opt ? 'var(--accent-dim)' : 'var(--bg-card)',
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
              'linear-gradient(90deg, var(--bg-card) 25%, var(--bg-hover) 50%, var(--bg-card) 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.4s infinite',
            borderRadius: 10,
          }}
        />
      ) : (
        <PressureScatter
          teams={tournamentFiltered}
          onTeamClick={goToTeam}
          prsMedian={prsMedian}
          ppiMedian={ppiMedian}
          ppiMin={ppiMin}
          ppiMax={ppiMax}
          selectedTeamId={null}
        />
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12,
          margin: '20px 0',
        }}
      >
        {Object.entries(QUADRANT_DESCRIPTIONS).map(([q, desc]) => (
          <div key={q} className="card" style={{ fontSize: 13 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: QUADRANT_COLORS[q],
                  display: 'inline-block',
                }}
              />
              <span style={{ textTransform: 'uppercase', fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                {q}
              </span>
            </div>
            <span style={{ color: 'var(--text-secondary)' }}>{desc}</span>
          </div>
        ))}
      </div>

      {!loading && teams && <ActionableInsight teams={teams} />}

      <h2 style={{ marginTop: 32 }}>Leaderboard</h2>
      <div style={{ display: 'flex', gap: 8, margin: '12px 0', flexWrap: 'wrap', alignItems: 'center' }}>
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
            minWidth: 180,
          }}
        />
        {['All', 'Elite', 'Pretenders', 'Grinders', 'Fragile'].map((q) => (
          <button
            key={q}
            onClick={() => setQuadrantFilter(q)}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: quadrantFilter === q ? '1px solid var(--accent-teal)' : '1px solid var(--border)',
              background: quadrantFilter === q ? 'var(--accent-dim)' : 'var(--bg-card)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            {q}
          </button>
        ))}
      </div>
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
                  padding: '10px 8px',
                  borderRadius: 6,
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                  transition: 'background 0.12s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ color: 'var(--text-secondary)', width: 24 }} className="mono">
                  {i + 1}
                </span>
                <Flag teamName={t.team_name} width={20} />
                <span style={{ flex: 1 }}>
                  {t.team_name} <span style={{ color: 'var(--text-secondary)' }}>({t.tournament})</span>
                  {t.low_sample_warning && (
                    <span
                      title={`Small losing-state sample (${t.losing_sample_size} actions) — PRS here is noisier than usual.`}
                      style={{ marginLeft: 6, color: 'var(--accent-amber)', cursor: 'help' }}
                    >
                      ⚠
                    </span>
                  )}
                  {t.surprising_result_note && (
                    <span
                      title={t.surprising_result_note}
                      style={{ marginLeft: 6, color: 'var(--accent-teal)', cursor: 'help' }}
                    >
                      ⓘ
                    </span>
                  )}
                </span>
                <QuadrantPill quadrant={t.quadrant} />
                <span
                  className="mono"
                  style={{
                    color: t.quadrant ? QUADRANT_COLORS[t.quadrant] : 'var(--text-faint)',
                    minWidth: 48,
                    textAlign: 'right',
                  }}
                >
                  {t.prs != null ? t.prs.toFixed(1) : '—'}
                </span>
                <span style={{ color: 'var(--text-faint)' }}>→</span>
              </div>
            ))}
        {!loading && filtered.length === 0 && (
          <p style={{ color: 'var(--text-secondary)', padding: '20px 0' }}>No teams match those filters.</p>
        )}
      </div>
    </div>
  )
}
