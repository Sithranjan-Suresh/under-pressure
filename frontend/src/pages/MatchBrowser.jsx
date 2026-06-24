import { useEffect, useMemo, useState } from 'react'
import { fetchMatches } from '../lib/api'
import Flag from '../components/Flag'
import MatchVaepBars from '../components/MatchVaepBars'

export default function MatchBrowser() {
  const [matches, setMatches] = useState(null)
  const [error, setError] = useState(null)
  const [tournament, setTournament] = useState('All')
  const [selectedId, setSelectedId] = useState(null)

  useEffect(() => {
    fetchMatches().then(setMatches).catch(setError)
  }, [])

  const filtered = useMemo(() => {
    if (!matches) return []
    if (tournament === 'All') return matches
    return matches.filter((m) => m.tournament === tournament)
  }, [matches, tournament])

  const selected = filtered.find((m) => m.match_id === selectedId) || filtered[0]

  if (error) return <p>Could not load matches.</p>

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <h1>
        The <span style={{ color: 'var(--accent)' }}>95%</span>, match by match
      </h1>
      <p style={{ color: 'var(--text-muted)', maxWidth: 640 }}>
        Every WC2018 + WC2022 match. Click one to see each team's match-average VAEP — the metric
        behind the 95% finding — with the higher value highlighted.
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

      {!matches ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading matches...</p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(260px, 380px) 1fr',
            gap: 24,
            alignItems: 'start',
          }}
        >
          <div
            style={{
              maxHeight: 600,
              overflowY: 'auto',
              border: '1px solid var(--bg-border)',
              borderRadius: 10,
            }}
          >
            {filtered.map((m) => (
              <div
                key={m.match_id}
                onClick={() => setSelectedId(m.match_id)}
                style={{
                  padding: '10px 14px',
                  borderBottom: '1px solid var(--bg-border)',
                  cursor: 'pointer',
                  background:
                    selected?.match_id === m.match_id ? 'var(--bg-elevated)' : 'transparent',
                  borderLeft:
                    selected?.match_id === m.match_id
                      ? '3px solid var(--accent)'
                      : '3px solid transparent',
                }}
              >
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                  {m.tournament} · {m.stage}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
                  <Flag teamName={m.home_team} width={16} />
                  <span style={{ flex: 1 }}>{m.home_team}</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{m.home_score}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, marginTop: 2 }}>
                  <Flag teamName={m.away_team} width={16} />
                  <span style={{ flex: 1 }}>{m.away_team}</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{m.away_score}</span>
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--bg-border)',
              borderRadius: 10,
              padding: 24,
              position: 'sticky',
              top: 80,
            }}
          >
            {selected ? (
              <>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                  {selected.tournament} · {selected.stage}
                </div>
                <MatchVaepBars match={selected} />
              </>
            ) : (
              <p style={{ color: 'var(--text-muted)' }}>Select a match to see the VAEP comparison.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
