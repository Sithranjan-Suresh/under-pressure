const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

async function request(path) {
  const response = await fetch(`${BASE_URL}${path}`)
  if (!response.ok) {
    throw new Error(`Request to ${path} failed with status ${response.status}`)
  }
  return response.json()
}

export function fetchTeams() {
  return request('/api/teams')
}

export function fetchTeam(teamId) {
  return request(`/api/team/${teamId}`)
}

export function fetchMatches() {
  return request('/api/matches')
}

export function fetchRegression() {
  return request('/api/regression')
}

export function fetchMethodology() {
  return request('/api/methodology')
}

export function fetchLiveTeams() {
  return request('/api/live/teams')
}
