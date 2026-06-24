import { Link } from 'react-router-dom'

function PitchLines() {
  const lines = [
    { top: '10%', rotate: -8, delay: '0s', duration: '38s' },
    { top: '35%', rotate: -8, delay: '-12s', duration: '44s' },
    { top: '60%', rotate: -8, delay: '-25s', duration: '40s' },
    { top: '85%', rotate: -8, delay: '-6s', duration: '46s' },
  ]
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      {lines.map((l, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            top: l.top,
            left: '-20%',
            width: '140%',
            height: 1,
            background: 'var(--accent-teal)',
            opacity: 0.06,
            transform: `rotate(${l.rotate}deg)`,
            animation: `drift ${l.duration} linear infinite`,
            animationDelay: l.delay,
          }}
        />
      ))}
    </div>
  )
}

const NAV_CARDS = [
  {
    to: '/home',
    title: 'Team Analysis',
    desc: 'Every team’s pressure resilience, plotted and ranked.',
  },
  {
    to: '/matches',
    title: 'Match Browser',
    desc: 'Every WC2018 + WC2022 match, with VAEP head-to-head.',
  },
  {
    to: '/live',
    title: '2026 Live',
    desc: 'Preliminary standings from the in-progress tournament.',
  },
]

export default function Landing() {
  return (
    <div style={{ background: 'var(--bg-primary)' }}>
      <section
        style={{
          position: 'relative',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '0 24px',
          overflow: 'hidden',
        }}
      >
        <PitchLines />
        <h1
          style={{
            position: 'relative',
            zIndex: 1,
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 'clamp(56px, 12vw, 140px)',
            letterSpacing: '0.04em',
            margin: 0,
            color: 'var(--text-primary)',
            lineHeight: 1,
          }}
        >
          UNDER <span style={{ color: 'var(--accent-teal)' }}>PRESSURE</span>
        </h1>
        <p
          style={{
            position: 'relative',
            zIndex: 1,
            maxWidth: 680,
            fontSize: 'clamp(16px, 2vw, 22px)',
            color: 'var(--text-primary)',
            marginTop: 24,
            lineHeight: 1.5,
          }}
        >
          Possession value — not rankings, not favorites — predicts who wins World Cup matches
          95% of the time.
        </p>
        <Link
          to="/home"
          style={{
            position: 'relative',
            zIndex: 1,
            marginTop: 40,
            display: 'inline-block',
            padding: '14px 32px',
            borderRadius: 8,
            background: 'var(--accent-teal)',
            color: 'var(--bg-primary)',
            fontWeight: 600,
            fontSize: 16,
            textDecoration: 'none',
          }}
        >
          Explore the Data →
        </Link>
      </section>

      <section
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: 16,
          padding: '0 24px 48px',
          maxWidth: 1000,
          margin: '0 auto',
        }}
      >
        {[
          { value: '95%', label: 'Match prediction accuracy' },
          { value: '100 matches', label: 'Across WC 2018 + WC 2022' },
          { value: 'VAEP', label: 'Action-level possession value metric' },
        ].map((s) => (
          <div
            key={s.label}
            className="card"
            style={{ flex: '1 1 240px', textAlign: 'center', padding: 32 }}
          >
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 44,
                color: 'var(--accent-teal)',
                fontWeight: 700,
              }}
            >
              {s.value}
            </div>
            <div style={{ color: 'var(--text-secondary)', marginTop: 8, fontSize: 14 }}>
              {s.label}
            </div>
          </div>
        ))}
      </section>

      <section
        style={{
          maxWidth: 1000,
          margin: '0 auto',
          padding: '48px 24px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 32,
        }}
      >
        <div>
          <h2 style={{ fontSize: 26 }}>What is VAEP?</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: 12, lineHeight: 1.7 }}>
            VAEP (Value of Actions by Estimating Probabilities) scores every pass, carry, and shot
            by how much it changes a team's probability of scoring and conceding in the next few
            actions. It measures the quality of play that's actually happening, independent of
            whether the ball happened to go in. Average it across a match, and you get a clean
            signal of who genuinely outplayed whom.
          </p>
        </div>
        <div>
          <h2 style={{ fontSize: 26 }}>What is PRS?</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: 12, lineHeight: 1.7 }}>
            The Pressure Resilience Score asks a narrower question: among teams that fall behind,
            who keeps generating value anyway? It compares a team's VAEP rate while losing against
            their own baseline rate when the score is level. A high PRS means a team's quality of
            play holds up — or even rises — when they're behind on the scoreboard.
          </p>
        </div>
      </section>

      <section
        style={{
          maxWidth: 1000,
          margin: '0 auto',
          padding: '0 24px 80px',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 16,
          }}
        >
          {NAV_CARDS.map((c) => (
            <Link
              key={c.to}
              to={c.to}
              className="card"
              style={{ textDecoration: 'none', display: 'block' }}
            >
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--text-primary)' }}>
                {c.title}
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 8 }}>{c.desc}</p>
              <span style={{ color: 'var(--accent-teal)', fontSize: 14 }}>Explore →</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
