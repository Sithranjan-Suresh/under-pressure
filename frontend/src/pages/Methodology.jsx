import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { useMethodology } from '../hooks/useMethodology'
import { fetchRegression } from '../lib/api'
import RegressionPanel from '../components/RegressionPanel'

const SECTIONS = ['The question', 'The data', 'The metric', 'The finding', 'Limitations', 'Data and code']

const slugify = (text) =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

function textContent(children) {
  return Array.isArray(children)
    ? children.map(textContent).join('')
    : typeof children === 'string'
    ? children
    : ''
}

const markdownComponents = {
  h2: ({ children }) => {
    const text = textContent(children)
    return (
      <h2
        id={slugify(text)}
        style={{
          borderLeft: '3px solid var(--accent-teal)',
          paddingLeft: 14,
          marginTop: 40,
          scrollMarginTop: 90,
        }}
      >
        {children}
      </h2>
    )
  },
  p: ({ children }) => {
    const text = textContent(children)
    const isFinding = text.includes('95.0%') && text.includes('won')
    if (isFinding) {
      return (
        <p
          className="card"
          style={{
            borderLeft: '3px solid var(--accent-teal)',
            background: 'var(--bg-secondary)',
            padding: '16px 20px',
            fontSize: 16,
            lineHeight: 1.7,
          }}
        >
          {children}
        </p>
      )
    }
    return <p style={{ lineHeight: 1.7 }}>{children}</p>
  },
}

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
    <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', gap: 40 }}>
      <aside
        style={{
          width: 180,
          flexShrink: 0,
          position: 'sticky',
          top: 80,
          alignSelf: 'flex-start',
          display: methodology ? 'block' : 'none',
        }}
      >
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 10 }}>
          On this page
        </div>
        {SECTIONS.map((s) => (
          <a
            key={s}
            href={`#${slugify(s)}`}
            style={{
              display: 'block',
              padding: '6px 0',
              fontSize: 14,
              color: 'var(--text-secondary)',
              textDecoration: 'none',
              borderLeft: '2px solid var(--border)',
              paddingLeft: 12,
            }}
          >
            {s}
          </a>
        ))}
      </aside>

      <div style={{ flex: 1, minWidth: 0 }}>
        <h1>Methodology</h1>

        {regressionLoading ? (
          <p style={{ color: 'var(--text-secondary)' }}>Loading regression results...</p>
        ) : (
          <RegressionPanel regression={regression} />
        )}

        <div style={{ marginTop: 32 }}>
          {methodology ? (
            <ReactMarkdown components={markdownComponents}>{methodology.content}</ReactMarkdown>
          ) : (
            <p>Loading...</p>
          )}
        </div>

        <div
          className="card"
          style={{
            marginTop: 24,
            fontSize: 13,
            color: 'var(--text-secondary)',
          }}
        >
          This framework was also applied to EURO 2024 and Copa América 2024 data as an exploratory
          cross-tournament check. It is not part of the primary model.
        </div>
      </div>
    </div>
  )
}
