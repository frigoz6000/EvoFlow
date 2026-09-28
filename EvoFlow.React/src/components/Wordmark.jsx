/**
 * The evoFlow wordmark: a heavy lowercase "evo" followed by a lighter "Flow",
 * matching the evoOrder lockup.
 *
 * Colours come from theme tokens rather than being baked in, because the mark
 * has to sit on the white cards AND on the dark navy sidebar - a navy "evo"
 * would be invisible there. Pass `onDark` for placement on a dark surface.
 */
export default function Wordmark({ onDark = false, size, className = '', style }) {
  const classes = ['wordmark']
  if (onDark) classes.push('wordmark-on-dark')
  if (className) classes.push(className)

  return (
    <span
      className={classes.join(' ')}
      style={size ? { fontSize: size, ...style } : style}
      // Screen readers should hear the brand once, not "evo" then "Flow".
      role="img"
      aria-label="evoFlow"
    >
      <span className="wordmark-evo" aria-hidden="true">evo</span>
      <span className="wordmark-suffix" aria-hidden="true">Flow</span>
    </span>
  )
}
