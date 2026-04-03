// ─── toMinutes ────────────────────────────────────────────────────────────────

/**
 * Normalises any time representation into an integer number of minutes.
 *
 * Supported input formats:
 *   number   → treated as minutes already       90      → 90
 *   "H:MM"   → hours:minutes                    "1:30"  → 90
 *   "Nh"     → decimal hours with h suffix      "2h"    → 120
 *   "N.N"    → decimal hours (dot present)      "1.5"   → 90
 *   "N"      → plain string treated as minutes  "90"    → 90
 */
export function toMinutes(value: string | number): number {
  if (typeof value === 'number') return Math.round(value)

  const s = value.trim()

  // H:MM format
  if (s.includes(':')) {
    const [h, m] = s.split(':')
    return Math.round(Number(h) * 60 + Number(m))
  }

  // "Nh" or "Nh Nm" format (e.g. "2h", "1h30m", "1h 30m")
  if (s.toLowerCase().includes('h')) {
    const hMatch = s.match(/(\d+(?:\.\d+)?)\s*h/i)
    const mMatch = s.match(/(\d+)\s*m/i)
    const hours   = hMatch ? Number(hMatch[1]) : 0
    const minutes = mMatch ? Number(mMatch[1]) : 0
    return Math.round(hours * 60 + minutes)
  }

  // Decimal hours (dot present, no h)
  if (s.includes('.')) {
    return Math.round(Number(s) * 60)
  }

  // Plain integer string — already minutes
  return Math.round(Number(s) || 0)
}

// ─── minutesToHours ───────────────────────────────────────────────────────────

/**
 * Formats an integer number of minutes into a human-readable string.
 *
 *   0   → "0m"
 *   30  → "30m"
 *   60  → "1h"
 *   90  → "1h 30m"
 *   120 → "2h"
 */
export function minutesToHours(minutes: number): string {
  const total = Math.round(minutes)
  if (total === 0) return '0m'
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}
