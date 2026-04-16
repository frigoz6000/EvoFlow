// Simple SVG flag components for the 6 supported languages

const flagStyle = { display: 'inline-block', borderRadius: 2, border: '1px solid rgba(0,0,0,0.12)', flexShrink: 0 }

export function FlagGB({ size = 20 }) {
  return (
    <svg width={size} height={size * 0.6} viewBox="0 0 60 36" style={flagStyle}>
      {/* UK Union Jack */}
      <rect width="60" height="36" fill="#012169"/>
      {/* White diagonals */}
      <path d="M0,0 L60,36 M60,0 L0,36" stroke="#fff" strokeWidth="7.2"/>
      {/* Red diagonals */}
      <path d="M0,0 L60,36 M60,0 L0,36" stroke="#C8102E" strokeWidth="4.8"/>
      {/* White cross */}
      <path d="M30,0 V36 M0,18 H60" stroke="#fff" strokeWidth="12"/>
      {/* Red cross */}
      <path d="M30,0 V36 M0,18 H60" stroke="#C8102E" strokeWidth="7.2"/>
    </svg>
  )
}

export function FlagFR({ size = 20 }) {
  return (
    <svg width={size} height={size * 0.6} viewBox="0 0 60 36" style={flagStyle}>
      {/* France tricolore */}
      <rect width="60" height="36" fill="#ED2939"/>
      <rect width="40" height="36" fill="#fff"/>
      <rect width="20" height="36" fill="#002395"/>
    </svg>
  )
}

export function FlagES({ size = 20 }) {
  return (
    <svg width={size} height={size * 0.6} viewBox="0 0 60 36" style={flagStyle}>
      {/* Spain */}
      <rect width="60" height="36" fill="#AA151B"/>
      <rect y="9" width="60" height="18" fill="#F1BF00"/>
    </svg>
  )
}

export function FlagDE({ size = 20 }) {
  return (
    <svg width={size} height={size * 0.6} viewBox="0 0 60 36" style={flagStyle}>
      {/* Germany */}
      <rect width="60" height="36" fill="#FFCE00"/>
      <rect width="60" height="24" fill="#DD0000"/>
      <rect width="60" height="12" fill="#000"/>
    </svg>
  )
}

export function FlagIT({ size = 20 }) {
  return (
    <svg width={size} height={size * 0.6} viewBox="0 0 60 36" style={flagStyle}>
      {/* Italy */}
      <rect width="60" height="36" fill="#CE2B37"/>
      <rect width="40" height="36" fill="#fff"/>
      <rect width="20" height="36" fill="#009246"/>
    </svg>
  )
}

export function FlagPT({ size = 20 }) {
  return (
    <svg width={size} height={size * 0.6} viewBox="0 0 60 36" style={flagStyle}>
      {/* Portugal */}
      <rect width="60" height="36" fill="#FF0000"/>
      <rect width="24" height="36" fill="#006600"/>
      {/* Simple shield emblem */}
      <circle cx="24" cy="18" r="6" fill="#FFD700" stroke="#006600" strokeWidth="1"/>
      <rect x="21" y="15" width="6" height="6" fill="#006600" opacity="0.5"/>
    </svg>
  )
}
