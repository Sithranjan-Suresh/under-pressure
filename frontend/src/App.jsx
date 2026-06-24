import { NavLink, Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import TeamDetail from './pages/TeamDetail'
import Live2026 from './pages/Live2026'
import Methodology from './pages/Methodology'

const navLinkStyle = ({ isActive }) => ({
  padding: '16px 0',
  marginRight: 24,
  color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
  borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
  textDecoration: 'none',
  fontFamily: 'var(--font-display)',
})

function App() {
  return (
    <div>
      <nav
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--bg-border)',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <NavLink to="/" style={{ ...navLinkStyle({ isActive: false }), fontWeight: 700, marginRight: 40 }}>
          UNDER PRESSURE
        </NavLink>
        <NavLink to="/" style={navLinkStyle} end>
          2022 Analysis
        </NavLink>
        <NavLink to="/live" style={navLinkStyle}>
          2026 Live
        </NavLink>
        <NavLink to="/methodology" style={navLinkStyle}>
          Methodology
        </NavLink>
      </nav>
      <main style={{ padding: 24 }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/team/:teamId" element={<TeamDetail />} />
          <Route path="/live" element={<Live2026 />} />
          <Route path="/methodology" element={<Methodology />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
