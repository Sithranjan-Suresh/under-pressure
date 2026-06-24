import {
  ResponsiveContainer,
  ScatterChart,
  XAxis,
  YAxis,
  ZAxis,
  Scatter,
  ReferenceLine,
  Tooltip,
  Cell,
} from 'recharts'
import { getFlagUrl } from '../lib/flags'

const QUADRANT_COLORS = {
  elite: 'var(--elite)',
  pretenders: 'var(--pretenders)',
  grinders: 'var(--grinders)',
  fragile: 'var(--fragile)',
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null
  const team = payload[0].payload
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        borderLeft: '3px solid var(--accent)',
        padding: '8px 12px',
        borderRadius: 4,
        color: 'var(--text-primary)',
        fontSize: 13,
      }}
    >
      <div style={{ fontFamily: 'var(--font-display)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
        {getFlagUrl(team.team_name) && <img src={getFlagUrl(team.team_name)} alt="" width={18} />}
        {team.team_name} ({team.tournament})
      </div>
      <div style={{ fontFamily: 'var(--font-mono)' }}>PRS: {team.prs ?? '—'}</div>
      <div style={{ fontFamily: 'var(--font-mono)' }}>Adj PRS: {team.adj_prs ?? '—'}</div>
      <div style={{ fontFamily: 'var(--font-mono)' }}>PPI: {team.ppi ?? '—'}</div>
      <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>{team.quadrant ?? 'insufficient data'}</div>
      {team.low_sample_warning && (
        <div style={{ color: 'var(--neutral)', marginTop: 4 }}>
          ⚠ small sample ({team.losing_sample_size} losing-state actions)
        </div>
      )}
      {team.surprising_result_note && (
        <div style={{ color: 'var(--accent)', marginTop: 4, maxWidth: 220 }}>ⓘ {team.surprising_result_note}</div>
      )}
    </div>
  )
}

export default function PressureScatter({ teams, onTeamClick, prsMedian, ppiMedian, selectedTeamId }) {
  const plotData = teams.map((t) => ({
    ...t,
    x: t.prs ?? 0,
    y: t.ppi ?? 0,
  }))

  return (
    <div style={{ position: 'relative', width: '100%', height: 480 }}>
      {[
        { label: 'ELITE', top: 0, left: '52%' },
        { label: 'PRETENDERS', top: 0, left: '2%' },
        { label: 'GRINDERS', top: '70%', left: '52%' },
        { label: 'FRAGILE', top: '70%', left: '2%' },
      ].map((q) => (
        <div
          key={q.label}
          style={{
            position: 'absolute',
            top: q.top,
            left: q.left,
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 28,
            color: 'var(--text-primary)',
            opacity: 0.08,
            pointerEvents: 'none',
            zIndex: 0,
          }}
        >
          {q.label}
        </div>
      ))}
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
          <XAxis
            type="number"
            dataKey="x"
            name="PRS"
            domain={[0, 100]}
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            stroke="var(--bg-border)"
          />
          <YAxis
            type="number"
            dataKey="y"
            name="PPI"
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            stroke="var(--bg-border)"
          />
          <ZAxis range={[60, 60]} />
          <Tooltip content={<CustomTooltip />} />
          {prsMedian != null && (
            <ReferenceLine x={prsMedian} stroke="var(--bg-border)" strokeDasharray="4 4" />
          )}
          {ppiMedian != null && (
            <ReferenceLine y={ppiMedian} stroke="var(--bg-border)" strokeDasharray="4 4" />
          )}
          <Scatter
            data={plotData}
            onClick={(point) => onTeamClick && onTeamClick(point)}
            cursor="pointer"
            label={(props) => {
              const { x, y, payload } = props
              if (!payload) return null
              const flagUrl = getFlagUrl(payload.team_name)
              if (!flagUrl) return null
              return <image href={flagUrl} x={x - 8} y={y - 22} width={16} height={12} />
            }}
          >
            {plotData.map((t) => {
              const isSelected = selectedTeamId === t.team_id
              const fill = t.quadrant ? QUADRANT_COLORS[t.quadrant] : 'var(--text-faint)'
              return (
                <Cell
                  key={t.team_id}
                  fill={fill}
                  r={isSelected ? 10 : 7}
                  stroke={isSelected ? 'white' : 'none'}
                  strokeWidth={isSelected ? 2 : 0}
                />
              )
            })}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}
