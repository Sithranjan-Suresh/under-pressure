import { useEffect, useState } from 'react'

export default function AnimatedNumber({ value, duration = 800, decimals = 0, suffix = '' }) {
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    if (value == null) return
    let start = null
    let raf

    const step = (timestamp) => {
      if (start === null) start = timestamp
      const progress = Math.min((timestamp - start) / duration, 1)
      setDisplay(value * progress)
      if (progress < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])

  if (value == null) return <span>—</span>
  return (
    <span>
      {display.toFixed(decimals)}
      {suffix}
    </span>
  )
}
