import { Link, useParams } from 'react-router-dom'
import { useTeam } from '../hooks/useTeam'
import ResilienceCard from '../components/ResilienceCard'
import PressureCurve from '../components/PressureCurve'
import StageDropoff from '../components/StageDropoff'
import TournamentTimeline from '../components/TournamentTimeline'
import Flag from '../components/Flag'

export default function TeamDetail() {
  const { teamId } = useParams()
  const { data: team, loading, error } = useTeam(teamId)

  if (loading || !team) {
    return <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
  }
  if (error) {
    return <p>Could not load this team.</p>
  }

  return (
    <div>
      <Link to="/home" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
        ← Back
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '16px 0' }}>
        <Flag teamName={team.team_name} width={56} />
        <div>
          <h1 style={{ margin: 0 }}>{team.team_name}</h1>
          <span style={{ color: 'var(--text-muted)' }}>
            {team.tournament} · {team.matches_played} matches
          </span>
        </div>
      </div>

      {(team.surprising_result_note || team.low_sample_warning) && (
        <div
          style={{
            background: 'var(--neutral-dim)',
            border: '1px solid var(--neutral)',
            borderRadius: 10,
            padding: 16,
            marginBottom: 24,
          }}
        >
          {team.surprising_result_note ? (
            <p style={{ margin: 0 }}>⚠ {team.surprising_result_note}</p>
          ) : (
            <p style={{ margin: 0 }}>
              ⚠ This PRS is based on a small losing-state sample ({team.losing_sample_size}{' '}
              actions across {team.matches_played} matches) — {team.team_name} rarely trailed, so
              this score is noisier than for teams who spent more time behind.
            </p>
          )}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 24,
        }}
      >
        <div>
          <ResilienceCard
            prs={team.prs}
            adjPrs={team.adj_prs}
            prsRank={team.combined_prs_rank}
            totalTeams={64}
            quadrant={team.quadrant}
          />
        </div>
        <div>
          <h3>Pressure Profile</h3>
          <PressureCurve curve={team.pressure_curve} />
        </div>
        <div>
          <h3>Stage Retention</h3>
          <StageDropoff groupVaep={team.group_vaep_avg} knockoutVaep={team.knockout_vaep_avg} />
        </div>
      </div>

      <h3 style={{ marginTop: 32 }}>Tournament Timeline</h3>
      <TournamentTimeline timeline={team.match_timeline} teamName={team.team_name} />

      {team.pressure_insight && (
        <div
          className="card"
          style={{
            marginTop: 32,
            borderLeft: '3px solid var(--accent-teal)',
            background: 'var(--bg-secondary)',
            padding: '20px 24px',
            fontSize: 17,
            lineHeight: 1.6,
          }}
        >
          {team.pressure_insight}
        </div>
      )}
    </div>
  )
}
