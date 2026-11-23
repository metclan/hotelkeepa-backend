const DAY_MS = 86_400_000;

export function hotelDayRange(now: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  });

  function localDay(timestamp: number) {
    const parts = formatter.formatToParts(timestamp);
    const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(item => item.type === type)?.value);
    return Date.UTC(part("year"), part("month") - 1, part("day"));
  }

  // Find the first instant of each hotel date even on 23- or 25-hour days.
  function boundary(day: number) {
    let before = day - DAY_MS;
    let after = day + DAY_MS;
    while (after - before > 1) {
      const middle = Math.floor((before + after) / 2);
      if (localDay(middle) < day) before = middle;
      else after = middle;
    }
    return new Date(after);
  }

  const today = localDay(now.getTime());
  return { start: boundary(today), end: boundary(today + DAY_MS) };
}
