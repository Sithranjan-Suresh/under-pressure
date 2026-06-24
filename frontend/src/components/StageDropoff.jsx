export default function StageDropoff({ groupVaep, knockoutVaep }) {
  if (knockoutVaep == null) {
    return <p style={{ color: 'var(--text-muted)' }}>This team was eliminated in the group stage.</p>
  }

  const maxVal = Math.max(groupVaep, knockoutVaep, 0.0001)
  const retentionPct = (knockoutVaep / groupVaep) * 100
  const changePct = retentionPct - 100
  const isPositive = changePct >= 0
  const retentionColor = retentionPct >= 95 ? 'var(--win)' : retentionPct >= 80 ? 'var(--neutral)' : 'var(--danger)'
  const knockoutColor = knockoutVaep >= groupVaep ? 'var(--win)' : 'var(--danger)'

  const Bar = ({ label, value, color }) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ background: 'var(--bg-elevated)', borderRadius: 4, height: 20, position: 'relative' }}>
        <div
          style={{
            width: `${(value / maxVal) * 100}%`,
            background: color,
            height: '100%',
            borderRadius: 4,
          }}
        />
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, marginTop: 2 }}>{value.toFixed(4)}</div>
    </div>
  )

  return (
    <div>
      <Bar label="Group Stage" value={groupVaep} color="var(--neutral)" />
      <Bar label="Knockouts" value={knockoutVaep} color={knockoutColor} />
      <div
        className="card"
        style={{
          marginTop: 16,
          borderLeft: `3px solid ${isPositive ? 'var(--win)' : 'var(--danger)'}`,
          padding: '14px 18px',
        }}
      >
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Stage Retention
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
          <span className="mono" style={{ fontSize: 28, fontWeight: 600, color: retentionColor }}>
            {retentionPct.toFixed(0)}%
          </span>
          <span className="mono" style={{ fontSize: 13, color: isPositive ? 'var(--win)' : 'var(--danger)' }}>
            {isPositive ? '+' : ''}{changePct.toFixed(0)}% vs. group stage
          </span>
        </div>
      </div>
    </div>
  )
}
