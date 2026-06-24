// Maps team display names (as returned by the API / StatsBomb / football-data.org) to
// flagcdn.com country codes. flagcdn serves actual flag images, which renders consistently
// across platforms -- unlike flag emoji, which Windows fonts often show as two-letter codes
// instead of a picture.
const TEAM_TO_FLAG_CODE = {
  Russia: 'ru', Germany: 'de', Brazil: 'br', Portugal: 'pt', Argentina: 'ar',
  Belgium: 'be', Poland: 'pl', France: 'fr', Spain: 'es', Peru: 'pe',
  Switzerland: 'ch', England: 'gb-eng', Colombia: 'co', Mexico: 'mx', Uruguay: 'uy',
  Croatia: 'hr', Denmark: 'dk', Iceland: 'is', 'Costa Rica': 'cr', Sweden: 'se',
  Tunisia: 'tn', Egypt: 'eg', Senegal: 'sn', Iran: 'ir', Serbia: 'rs',
  Nigeria: 'ng', Australia: 'au', Japan: 'jp', Morocco: 'ma', Panama: 'pa',
  'South Korea': 'kr', 'Saudi Arabia': 'sa', Netherlands: 'nl', 'United States': 'us',
  Qatar: 'qa', Wales: 'gb-wls', Canada: 'ca', Ecuador: 'ec', Cameroon: 'cm',
  Ghana: 'gh', Algeria: 'dz', Austria: 'at', 'Bosnia-Herzegovina': 'ba',
  'Cape Verde Islands': 'cv', 'Congo DR': 'cd', Curaçao: 'cw', Czechia: 'cz',
  Haiti: 'ht', Iraq: 'iq', 'Ivory Coast': 'ci', Jordan: 'jo', 'New Zealand': 'nz',
  Norway: 'no', Paraguay: 'py', Scotland: 'gb-sct', 'South Africa': 'za',
  Turkey: 'tr', Uzbekistan: 'uz',
}

export function getFlagUrl(teamName, width = 40) {
  const code = TEAM_TO_FLAG_CODE[teamName]
  if (!code) return null
  return `https://flagcdn.com/w${width}/${code}.png`
}
