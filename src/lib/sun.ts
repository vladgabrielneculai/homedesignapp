/**
 * Sun position from location, date and clock time (NOAA's simplified solar equations, accurate to a
 * fraction of a degree), plus a list of cities with their time zones.
 */

export type Dst = 'eu' | 'us' | 'au' | 'nz' | 'none'

export interface City {
  name: string
  lat: number
  lon: number
  /** Standard UTC offset in hours. */
  utc: number
  dst: Dst
  /** IANA zone, used to pick a default city from the browser's time zone. */
  tz: string
}

export const CITIES: City[] = [
  { name: 'Bucharest', lat: 44.43, lon: 26.1, utc: 2, dst: 'eu', tz: 'Europe/Bucharest' },
  { name: 'Cluj-Napoca', lat: 46.77, lon: 23.6, utc: 2, dst: 'eu', tz: '' },
  { name: 'Iași', lat: 47.16, lon: 27.59, utc: 2, dst: 'eu', tz: '' },
  { name: 'Timișoara', lat: 45.76, lon: 21.23, utc: 2, dst: 'eu', tz: '' },
  { name: 'Constanța', lat: 44.18, lon: 28.65, utc: 2, dst: 'eu', tz: '' },
  { name: 'Brașov', lat: 45.66, lon: 25.61, utc: 2, dst: 'eu', tz: '' },
  { name: 'Chișinău', lat: 47.01, lon: 28.86, utc: 2, dst: 'eu', tz: 'Europe/Chisinau' },
  { name: 'Sofia', lat: 42.7, lon: 23.32, utc: 2, dst: 'eu', tz: 'Europe/Sofia' },
  { name: 'Athens', lat: 37.98, lon: 23.73, utc: 2, dst: 'eu', tz: 'Europe/Athens' },
  { name: 'Helsinki', lat: 60.17, lon: 24.94, utc: 2, dst: 'eu', tz: 'Europe/Helsinki' },
  { name: 'Kyiv', lat: 50.45, lon: 30.52, utc: 2, dst: 'eu', tz: 'Europe/Kyiv' },
  { name: 'Istanbul', lat: 41.01, lon: 28.98, utc: 3, dst: 'none', tz: 'Europe/Istanbul' },
  { name: 'Budapest', lat: 47.5, lon: 19.04, utc: 1, dst: 'eu', tz: 'Europe/Budapest' },
  { name: 'Belgrade', lat: 44.79, lon: 20.45, utc: 1, dst: 'eu', tz: 'Europe/Belgrade' },
  { name: 'Vienna', lat: 48.21, lon: 16.37, utc: 1, dst: 'eu', tz: 'Europe/Vienna' },
  { name: 'Warsaw', lat: 52.23, lon: 21.01, utc: 1, dst: 'eu', tz: 'Europe/Warsaw' },
  { name: 'Prague', lat: 50.08, lon: 14.44, utc: 1, dst: 'eu', tz: 'Europe/Prague' },
  { name: 'Berlin', lat: 52.52, lon: 13.4, utc: 1, dst: 'eu', tz: 'Europe/Berlin' },
  { name: 'Munich', lat: 48.14, lon: 11.58, utc: 1, dst: 'eu', tz: '' },
  { name: 'Rome', lat: 41.9, lon: 12.5, utc: 1, dst: 'eu', tz: 'Europe/Rome' },
  { name: 'Milan', lat: 45.46, lon: 9.19, utc: 1, dst: 'eu', tz: '' },
  { name: 'Paris', lat: 48.86, lon: 2.35, utc: 1, dst: 'eu', tz: 'Europe/Paris' },
  { name: 'Brussels', lat: 50.85, lon: 4.35, utc: 1, dst: 'eu', tz: 'Europe/Brussels' },
  { name: 'Amsterdam', lat: 52.37, lon: 4.9, utc: 1, dst: 'eu', tz: 'Europe/Amsterdam' },
  { name: 'Copenhagen', lat: 55.68, lon: 12.57, utc: 1, dst: 'eu', tz: 'Europe/Copenhagen' },
  { name: 'Stockholm', lat: 59.33, lon: 18.07, utc: 1, dst: 'eu', tz: 'Europe/Stockholm' },
  { name: 'Oslo', lat: 59.91, lon: 10.75, utc: 1, dst: 'eu', tz: 'Europe/Oslo' },
  { name: 'Zurich', lat: 47.38, lon: 8.54, utc: 1, dst: 'eu', tz: 'Europe/Zurich' },
  { name: 'Madrid', lat: 40.42, lon: -3.7, utc: 1, dst: 'eu', tz: 'Europe/Madrid' },
  { name: 'Barcelona', lat: 41.39, lon: 2.17, utc: 1, dst: 'eu', tz: '' },
  { name: 'Lisbon', lat: 38.72, lon: -9.14, utc: 0, dst: 'eu', tz: 'Europe/Lisbon' },
  { name: 'London', lat: 51.51, lon: -0.13, utc: 0, dst: 'eu', tz: 'Europe/London' },
  { name: 'Dublin', lat: 53.35, lon: -6.26, utc: 0, dst: 'eu', tz: 'Europe/Dublin' },
  { name: 'Moscow', lat: 55.76, lon: 37.62, utc: 3, dst: 'none', tz: 'Europe/Moscow' },
  { name: 'Dubai', lat: 25.2, lon: 55.27, utc: 4, dst: 'none', tz: 'Asia/Dubai' },
  { name: 'Mumbai', lat: 19.08, lon: 72.88, utc: 5.5, dst: 'none', tz: 'Asia/Kolkata' },
  { name: 'Singapore', lat: 1.35, lon: 103.82, utc: 8, dst: 'none', tz: 'Asia/Singapore' },
  { name: 'Beijing', lat: 39.9, lon: 116.4, utc: 8, dst: 'none', tz: 'Asia/Shanghai' },
  { name: 'Seoul', lat: 37.57, lon: 126.98, utc: 9, dst: 'none', tz: 'Asia/Seoul' },
  { name: 'Tokyo', lat: 35.68, lon: 139.69, utc: 9, dst: 'none', tz: 'Asia/Tokyo' },
  { name: 'Sydney', lat: -33.87, lon: 151.21, utc: 10, dst: 'au', tz: 'Australia/Sydney' },
  { name: 'Melbourne', lat: -37.81, lon: 144.96, utc: 10, dst: 'au', tz: 'Australia/Melbourne' },
  { name: 'Auckland', lat: -36.85, lon: 174.76, utc: 12, dst: 'nz', tz: 'Pacific/Auckland' },
  { name: 'Cairo', lat: 30.04, lon: 31.24, utc: 2, dst: 'none', tz: 'Africa/Cairo' },
  { name: 'Lagos', lat: 6.52, lon: 3.38, utc: 1, dst: 'none', tz: 'Africa/Lagos' },
  { name: 'Nairobi', lat: -1.29, lon: 36.82, utc: 3, dst: 'none', tz: 'Africa/Nairobi' },
  { name: 'Cape Town', lat: -33.92, lon: 18.42, utc: 2, dst: 'none', tz: 'Africa/Johannesburg' },
  { name: 'New York', lat: 40.71, lon: -74.01, utc: -5, dst: 'us', tz: 'America/New_York' },
  { name: 'Toronto', lat: 43.65, lon: -79.38, utc: -5, dst: 'us', tz: 'America/Toronto' },
  { name: 'Chicago', lat: 41.88, lon: -87.63, utc: -6, dst: 'us', tz: 'America/Chicago' },
  { name: 'Denver', lat: 39.74, lon: -104.99, utc: -7, dst: 'us', tz: 'America/Denver' },
  { name: 'Los Angeles', lat: 34.05, lon: -118.24, utc: -8, dst: 'us', tz: 'America/Los_Angeles' },
  { name: 'Vancouver', lat: 49.28, lon: -123.12, utc: -8, dst: 'us', tz: 'America/Vancouver' },
  { name: 'Mexico City', lat: 19.43, lon: -99.13, utc: -6, dst: 'none', tz: 'America/Mexico_City' },
  { name: 'São Paulo', lat: -23.55, lon: -46.63, utc: -3, dst: 'none', tz: 'America/Sao_Paulo' },
  { name: 'Buenos Aires', lat: -34.6, lon: -58.38, utc: -3, dst: 'none', tz: 'America/Argentina/Buenos_Aires' },
]

export function defaultCity(): City {
  let tz = ''
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    /* unknown zone */
  }
  return CITIES.find((c) => c.tz && c.tz === tz) ?? CITIES.find((c) => c.name === 'London')!
}

export function getCity(name: string | undefined): City | undefined {
  return CITIES.find((c) => c.name === name)
}

/** Whether daylight saving time is in effect on a day of the year (approximate rule per region). */
function dstActive(dst: Dst, doy: number): boolean {
  switch (dst) {
    case 'eu':
      return doy >= 88 && doy < 299 // ~ last Sunday of March to last Sunday of October
    case 'us':
      return doy >= 70 && doy < 307 // ~ second Sunday of March to first Sunday of November
    case 'au':
      return doy >= 278 || doy < 96 // ~ first Sunday of October to first Sunday of April
    case 'nz':
      return doy >= 270 || doy < 96
    default:
      return false
  }
}

export interface SunPosition {
  /** Degrees above the horizon (negative at night). */
  altitude: number
  /** Compass bearing in degrees, clockwise from north. */
  azimuth: number
}

/**
 * @param doy day of the year, 1-365
 * @param hour local clock time in hours (e.g. 14.5)
 */
export function sunPosition(lat: number, lon: number, utc: number, dst: Dst, doy: number, hour: number): SunPosition {
  const rad = Math.PI / 180
  const g = ((2 * Math.PI) / 365) * (doy - 1 + (hour - 12) / 24)
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g))
  const decl =
    0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g)
  const zone = utc + (dstActive(dst, doy) ? 1 : 0)
  const trueSolarMinutes = hour * 60 + eqTime + 4 * lon - 60 * zone
  const ha = (trueSolarMinutes / 4 - 180) * rad
  const phi = lat * rad
  const cosZen = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha)
  const zen = Math.acos(Math.max(-1, Math.min(1, cosZen)))
  const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) / rad + 180
  return { altitude: 90 - zen / rad, azimuth: ((az % 360) + 360) % 360 }
}

export function dayOfYear(month: number, day: number): number {
  const starts = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
  return starts[month - 1] + day
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatHour(h: number): string {
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  return `${String(hh).padStart(2, '0')}:${String(mm === 60 ? 0 : mm).padStart(2, '0')}`
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

export const compassName = (deg: number) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]
