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
  Label,
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
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderLeft: '3px solid var(--accent-teal)',
        padding: '10px 14px',
        borderRadius: 6,
        color: 'var(--text-primary)',
        fontSize: 13,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      }}
    >
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
        {getFlagUrl(team.team_name) && <img src={getFlagUrl(team.team_name)} alt="" width={18} />}
        {team.team_name} <span style={{ color: 'var(--text-secondary)' }}>({team.tournament})</span>
      </div>
      <div className="mono">PRS: {team.prs ?? '—'}</div>
      <div className="mono">Adj PRS: {team.adj_prs ?? '—'}</div>
      <div className="mono">PPI: {team.ppi ?? '—'}</div>
      <div style={{ color: 'var(--text-secondary)', marginTop: 4, textTransform: 'capitalize' }}>
        {team.quadrant ?? 'insufficient data'}
      </div>
      {team.low_sample_warning && (
        <div style={{ color: 'var(--accent-amber)', marginTop: 4 }}>
          ⚠ small sample ({team.losing_sample_size} losing-state actions)
        </div>
      )}
      {team.surprising_result_note && (
        <div style={{ color: 'var(--accent-teal)', marginTop: 4, maxWidth: 240 }}>
          ⓘ {team.surprising_result_note}
        </div>
      )}
    </div>
  )
}

export default function PressureScatter({ teams, onTeamClick, prsMedian, ppiMedian, ppiMin, ppiMax, selectedTeamId }) {
  const plotData = teams.map((t) => ({
    ...t,
    x: t.ppi ?? 0,
    y: t.prs ?? 0,
  }))

  const xDomain = ppiMin != null && ppiMax != null ? [ppiMin, ppiMax] : ['auto', 'auto']
  const formatLowHigh = (lo, hi) => (v) => (v <= lo + (hi - lo) * 0.02 ? 'Low' : v >= hi - (hi - lo) * 0.02 ? 'High' : '')

  return (
    <div style={{ position: 'relative', width: '100%', height: 480 }}>
      {/*
        Axes: X = base possession quality (PPI), Y = pressure resilience (PRS) -- this means
        quadrant positions are: ELITE top-right, PRETENDERS bottom-right, GRINDERS top-left,
        FRAGILE bottom-left. Positioned at the actual plot-area quadrant centers, not the whole
        container, since Recharts reserves gutters for axis labels beyond the chart margins.
      */}
      {[
        { label: 'ELITE', top: '22%', left: '74%' },
        { label: 'GRINDERS', top: '22%', left: '28%' },
        { label: 'PRETENDERS', top: '70%', left: '74%' },
        { label: 'FRAGILE', top: '70%', left: '28%' },
      ].map((q) => (
        <div
          key={q.label}
          style={{
            position: 'absolute',
            top: q.top,
            left: q.left,
            transform: 'translate(-50%, -50%)',
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 30,
            letterSpacing: 1,
            color: 'var(--text-primary)',
            opacity: 0.16,
            pointerEvents: 'none',
            zIndex: 0,
            whiteSpace: 'nowrap',
          }}
        >
          {q.label}
        </div>
      ))}
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 20, right: 20, bottom: 36, left: 50 }}>
          <XAxis
            type="number"
            dataKey="x"
            name="Base Possession Quality"
            domain={xDomain}
            ticks={ppiMin != null ? [ppiMin, ppiMax] : undefined}
            tickFormatter={ppiMin != null ? formatLowHigh(ppiMin, ppiMax) : undefined}
            tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
            stroke="var(--border)"
          >
            <Label
              value="Base Possession Quality (PPI Percentile)"
              position="insideBottom"
              offset={-10}
              fill="var(--text-secondary)"
              fontSize={12}
            />
          </XAxis>
          <YAxis
            type="number"
            dataKey="y"
            name="Pressure Resilience"
            domain={[0, 100]}
            ticks={[0, 100]}
            tickFormatter={(v) => (v === 0 ? 'Low' : v === 100 ? 'High' : '')}
            tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
            stroke="var(--border)"
          >
            <Label
              value="Pressure Resilience"
              angle={-90}
              position="insideLeft"
              fill="var(--text-secondary)"
              fontSize={12}
              style={{ textAnchor: 'middle' }}
            />
          </YAxis>
          <ZAxis range={[60, 60]} />
          <Tooltip content={<CustomTooltip />} />
          {ppiMedian != null && (
            <ReferenceLine x={ppiMedian} stroke="var(--border)" strokeDasharray="4 4" />
          )}
          {prsMedian != null && (
            <ReferenceLine y={prsMedian} stroke="var(--border)" strokeDasharray="4 4" />
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
