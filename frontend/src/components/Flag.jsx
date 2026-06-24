import { getFlagUrl } from '../lib/flags'

export default function Flag({ teamName, width = 24, style = {} }) {
  const url = getFlagUrl(teamName, width)
  if (!url) return null
  return (
    <img
      src={url}
      alt={`${teamName} flag`}
      width={width}
      style={{ display: 'inline-block', verticalAlign: 'middle', borderRadius: 2, ...style }}
    />
  )
}
