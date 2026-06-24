import { useEffect, useState } from 'react'
import { fetchTeam } from '../lib/api'

export function useTeam(teamId) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(Boolean(teamId))
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!teamId) return
    let cancelled = false
    setLoading(true)
    setData(null)
    fetchTeam(teamId)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err) => {
        if (!cancelled) setError(err)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [teamId])

  return { data, loading, error }
}
