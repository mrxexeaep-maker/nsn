const DAY_MS = 24 * 60 * 60 * 1000

/** The UTC day of `date` as an ISO date, the form every table keys on. */
export const utcDay = (date: Date) => date.toISOString().slice(0, 10)

export const addDays = (day: string, days: number) =>
  utcDay(new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS))

/** Every day from `start` to `end`, both included, oldest first. */
export function daysBetween(start: string, end: string): string[] {
  const days: string[] = []
  for (let day = start; day <= end; day = addDays(day, 1)) days.push(day)
  return days
}
