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

// ─── Asia/Tashkent week helpers ──────────────────────────────────────────────

const TASHKENT_TZ = 'Asia/Tashkent'

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
}

/**
 * Returns the calendar parts (year/month/day/weekday) for `d` as observed in
 * Asia/Tashkent. Uses Intl.DateTimeFormat so DST/offset changes (Tashkent has
 * no DST today, but the API stays correct if that ever changes) are handled
 * by the platform rather than ad-hoc UTC offset math.
 */
export function getTashkentParts(d: Date): {
  year:    number
  month:   number   // 1-12
  day:     number
  weekday: number   // 0=Sun … 6=Sat
} {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TASHKENT_TZ,
    year:     'numeric',
    month:    '2-digit',
    day:      '2-digit',
    weekday:  'short',
  })

  const parts = fmt.formatToParts(d)
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? ''

  return {
    year:    Number(get('year')),
    month:   Number(get('month')),
    day:     Number(get('day')),
    weekday: WEEKDAY_INDEX[get('weekday')] ?? 0,
  }
}

/**
 * Returns the Monday (YYYY-MM-DD) of the Asia/Tashkent calendar week
 * containing the moment `d`.
 *
 * Example: at 2026-04-26T20:00:00Z (Sunday in UTC) the Tashkent local time is
 * 2026-04-27 01:00 (Monday), so this returns "2026-04-27".
 */
export function tashkentMondayOf(d: Date): string {
  const { year, month, day, weekday } = getTashkentParts(d)

  // Days back to the most recent Monday (1 = Mon … 0 = Sun)
  const diff = weekday === 0 ? -6 : 1 - weekday

  // Use a synthetic UTC frame for date-only arithmetic. Calendar walk-back is
  // identical regardless of timezone because we're stepping whole days.
  const anchor = new Date(Date.UTC(year, month - 1, day))
  anchor.setUTCDate(anchor.getUTCDate() + diff)
  return anchor.toISOString().slice(0, 10)
}

/**
 * Variant of `tashkentMondayOf` for inputs that are already YYYY-MM-DD
 * calendar strings (e.g. workload_entries.start_date / due_date columns).
 *
 * The string is treated as a calendar date in Asia/Tashkent — there is no
 * timezone ambiguity for date-only values, so we just resolve weekday from
 * the same calendar day and walk back to Monday.
 */
export function tashkentMondayFromDateStr(s: string): string {
  // Parse YYYY-MM-DD as UTC midnight so getUTCDay returns the calendar weekday
  // for that date (no DST ambiguity for date-only values).
  const utc = new Date(`${s}T00:00:00Z`)
  const weekday = utc.getUTCDay()
  const diff = weekday === 0 ? -6 : 1 - weekday
  utc.setUTCDate(utc.getUTCDate() + diff)
  return utc.toISOString().slice(0, 10)
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
