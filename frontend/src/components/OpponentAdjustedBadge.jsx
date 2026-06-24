export default function OpponentAdjustedBadge({ adjPrs }) {
  if (adjPrs == null) return null
  return (
    <span
      title="Adjusted for strength of opposition faced."
      style={{
        display: 'inline-block',
        padding: '4px 10px',
        borderRadius: 999,
        fontSize: 12,
        background: 'var(--accent-dim)',
        border: '1px solid var(--accent-border)',
        color: 'var(--accent)',
        fontFamily: 'var(--font-mono)',
      }}
    >
      Adj. PRS {adjPrs.toFixed(1)}
    </span>
  )
}
