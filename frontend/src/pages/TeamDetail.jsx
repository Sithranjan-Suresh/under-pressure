import { Link, useParams } from 'react-router-dom'
import { useTeam } from '../hooks/useTeam'
import ResilienceCard from '../components/ResilienceCard'
import PressureCurve from '../components/PressureCurve'
import StageDropoff from '../components/StageDropoff'
import TournamentTimeline from '../components/TournamentTimeline'

const INSIGHTS = {
  elite: (name) =>
    `${name} generates high possession value and sustains it under pressure — their VAEP rises when losing, not falls.`,
  pretenders: (name) =>
    `${name} peaks in low-pressure situations but shows a measurable VAEP drop in deficit states. Their performance on the scoresheet overstates their resilience.`,
  grinders: (name) =>
    `${name}'s baseline output is modest, but their VAEP rate holds steady — or rises — when chasing a deficit. A dangerous team to face when they're behind.`,
  fragile: (name) =>
    `${name}'s possession value collapses under pressure. Their tournament exits tend to follow the first moment they fall behind.`,
}

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
      <Link to="/" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
        ← Back
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '16px 0' }}>
        <span style={{ fontSize: '3rem' }}>{team.flag_emoji}</span>
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

      {team.quadrant && (
        <div
          style={{
            marginTop: 32,
            background: 'var(--accent-dim)',
            border: '1px solid var(--accent-border)',
            borderRadius: 10,
            padding: 16,
          }}
        >
          {INSIGHTS[team.quadrant](team.team_name)}
        </div>
      )}
    </div>
  )
}
