import Flag from './Flag'

export default function MatchVaepBars({ match }) {
  const { home_team, away_team, home_score, away_score, home_vaep_avg, away_vaep_avg } = match

  const homeHigher = home_vaep_avg != null && away_vaep_avg != null && home_vaep_avg > away_vaep_avg
  const awayHigher = home_vaep_avg != null && away_vaep_avg != null && away_vaep_avg > home_vaep_avg

  const maxVaep = Math.max(home_vaep_avg ?? 0, away_vaep_avg ?? 0, 0.0001)

  const Row = ({ team, score, vaep, isWinner }) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Flag teamName={team} width={20} />
        <span style={{ fontWeight: isWinner ? 700 : 400, color: isWinner ? 'var(--win)' : 'var(--text-primary)' }}>
          {team}
        </span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
          {score}
        </span>
      </div>
      <div style={{ background: 'var(--bg-elevated)', borderRadius: 4, height: 22, position: 'relative' }}>
        <div
          style={{
            width: vaep != null ? `${(vaep / maxVaep) * 100}%` : 0,
            height: '100%',
            borderRadius: 4,
            background: isWinner ? 'var(--win)' : 'var(--accent)',
            transition: 'width 0.3s',
          }}
        />
        <span
          style={{
            position: 'absolute',
            right: 8,
            top: 0,
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--text-primary)',
          }}
        >
          {vaep != null ? vaep.toFixed(4) : '—'}
        </span>
      </div>
    </div>
  )

  return (
    <div>
      <Row team={home_team} score={home_score} vaep={home_vaep_avg} isWinner={homeHigher} />
      <Row team={away_team} score={away_score} vaep={away_vaep_avg} isWinner={awayHigher} />
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
        {homeHigher && `${home_team} generated more possession value (VAEP) — `}
        {awayHigher && `${away_team} generated more possession value (VAEP) — `}
        {homeHigher || awayHigher
          ? (home_score > away_score && homeHigher) || (away_score > home_score && awayHigher)
            ? 'and won the match.'
            : 'but did not win the match.'
          : 'VAEP averages were effectively tied.'}
      </p>
    </div>
  )
}
