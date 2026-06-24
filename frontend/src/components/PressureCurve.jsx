import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  ReferenceLine,
  Tooltip,
  Dot,
  Label,
} from 'recharts'

const STATE_COLOR = {
  winning_big: 'var(--win)',
  winning_close: 'var(--win)',
  level: 'var(--neutral)',
  losing_close: 'var(--danger)',
  losing_big: 'var(--danger)',
}

function CustomDot(props) {
  const { cx, cy, payload } = props
  if (payload.vaep_rate == null) return null
  return <Dot cx={cx} cy={cy} r={5} fill={STATE_COLOR[payload.state]} />
}

export default function PressureCurve({ curve }) {
  const levelEntry = curve.find((c) => c.state === 'level')
  const losingCloseEntry = curve.find((c) => c.state === 'losing_close')

  let interpretation = 'holds steady'
  if (levelEntry?.vaep_rate != null && losingCloseEntry?.vaep_rate != null) {
    if (losingCloseEntry.vaep_rate > levelEntry.vaep_rate) interpretation = 'rises'
    else if (losingCloseEntry.vaep_rate < levelEntry.vaep_rate) interpretation = 'falls'
  }

  return (
    <div>
      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={curve} margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
            <XAxis
              dataKey="label"
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              stroke="var(--bg-border)"
            />
            <YAxis
              tickFormatter={(v) => (v * 1000).toFixed(1)}
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              stroke="var(--bg-border)"
            >
              <Label
                value="VAEP Rate (×10⁻³)"
                angle={-90}
                position="insideLeft"
                fill="var(--text-muted)"
                fontSize={11}
                style={{ textAnchor: 'middle' }}
              />
            </YAxis>
            <Tooltip
              formatter={(value) => (value == null ? '—' : value.toFixed(4))}
              contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--accent)' }}
            />
            {levelEntry?.vaep_rate != null && (
              <ReferenceLine
                y={levelEntry.vaep_rate}
                stroke="var(--text-muted)"
                strokeDasharray="4 4"
                label={{ value: 'Baseline', fill: 'var(--text-muted)', fontSize: 10, position: 'insideTopLeft' }}
              />
            )}
            <Line
              type="monotone"
              dataKey="vaep_rate"
              stroke="var(--accent)"
              strokeWidth={2.5}
              dot={<CustomDot />}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 8 }}>
        This team's VAEP rate {interpretation} when losing.
      </p>
    </div>
  )
}
