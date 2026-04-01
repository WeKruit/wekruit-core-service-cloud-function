import { DateTime } from 'luxon';

export function formatUtcIso(value: string) {
  return DateTime.fromISO(value).toUTC().toISO();
}
