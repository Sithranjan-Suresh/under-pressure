import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { useMethodology } from '../hooks/useMethodology'
import { fetchRegression } from '../lib/api'
import RegressionPanel from '../components/RegressionPanel'

export default function Methodology() {
  const { data: methodology } = useMethodology()
  const [regression, setRegression] = useState(null)
  const [regressionLoading, setRegressionLoading] = useState(true)

  useEffect(() => {
    fetchRegression()
      .then(setRegression)
      .catch(() => setRegression(null))
      .finally(() => setRegressionLoading(false))
  }, [])

  return (
    <div>
      <h1>Methodology</h1>

      {regressionLoading ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading regression results...</p>
      ) : (
        <RegressionPanel regression={regression} />
      )}

      <div style={{ marginTop: 32, lineHeight: 1.6 }}>
        {methodology ? <ReactMarkdown>{methodology.content}</ReactMarkdown> : <p>Loading...</p>}
      </div>

      <div
        style={{
          marginTop: 24,
          background: 'var(--bg-surface)',
          border: '1px solid var(--bg-border)',
          borderRadius: 10,
          padding: 16,
          fontSize: 13,
          color: 'var(--text-muted)',
        }}
      >
        This framework was also applied to EURO 2024 and Copa América 2024 data as an exploratory
        cross-tournament check. It is not part of the primary model.
      </div>
    </div>
  )
}
