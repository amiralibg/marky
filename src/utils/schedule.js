export const parseTimeString = (value) => {
  if (!value) {
    return { hours: 9, minutes: 0 };
  }

  const [hoursRaw, minutesRaw] = value.split(":");
  const hours = Number.parseInt(hoursRaw, 10);
  const minutes = Number.parseInt(minutesRaw, 10);

  return {
    hours: Number.isFinite(hours) ? hours : 9,
    minutes: Number.isFinite(minutes) ? minutes : 0,
  };
};

export const addMinutes = (date, minutes) => {
  const result = new Date(date);
  result.setMinutes(result.getMinutes() + minutes);
  return result;
};

export const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const clampDayOfMonth = (year, month, day) => {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return Math.min(Math.max(day, 1), daysInMonth);
};

export const withTimeOfDay = (date, timeOfDay) => {
  const { hours, minutes } = parseTimeString(timeOfDay);
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
};

const getNextWeeklyOccurrence = (fromDate, daysOfWeek, timeOfDay) => {
  const normalizedDays = Array.from(
    new Set(
      (Array.isArray(daysOfWeek) ? daysOfWeek : [fromDate.getDay()]).map((day) => {
        const normalized = Number.parseInt(day, 10);
        if (!Number.isFinite(normalized)) return 0;
        return ((normalized % 7) + 7) % 7;
      })
    )
  ).sort((a, b) => a - b);

  for (let offset = 0; offset < 14; offset += 1) {
    const candidateDate = addDays(fromDate, offset);
    if (normalizedDays.includes(candidateDate.getDay())) {
      const candidate = withTimeOfDay(candidateDate, timeOfDay);
      if (candidate > fromDate) {
        return candidate;
      }
    }
  }

  return withTimeOfDay(addDays(fromDate, 7), timeOfDay);
};

const getNextMonthlyOccurrence = (fromDate, dayOfMonth, timeOfDay) => {
  const base = new Date(fromDate);
  const year = base.getFullYear();
  const month = base.getMonth();
  const day = clampDayOfMonth(year, month, dayOfMonth || base.getDate());
  let candidate = withTimeOfDay(new Date(year, month, day), timeOfDay);

  if (candidate <= fromDate) {
    const nextMonth = new Date(year, month + 1, 1);
    const nextDay = clampDayOfMonth(
      nextMonth.getFullYear(),
      nextMonth.getMonth(),
      dayOfMonth || base.getDate()
    );
    candidate = withTimeOfDay(
      new Date(nextMonth.getFullYear(), nextMonth.getMonth(), nextDay),
      timeOfDay
    );
  }

  return candidate;
};

export const calculateNextRun = (schedule, referenceDate = new Date()) => {
  if (!schedule) return null;

  const { frequency, timeOfDay = "09:00", startDate } = schedule;
  if (!frequency) return null;

  const now = new Date(referenceDate);
  const start = startDate ? new Date(`${startDate}T00:00:00`) : null;
  const baseline = start && !Number.isNaN(start.getTime()) && start > now ? start : now;

  let candidate;

  switch (frequency) {
    case "daily": {
      candidate = withTimeOfDay(baseline, timeOfDay);
      if (candidate <= now) {
        candidate = withTimeOfDay(addDays(baseline, 1), timeOfDay);
      }
      break;
    }
    case "weekly": {
      const days =
        Array.isArray(schedule.daysOfWeek) && schedule.daysOfWeek.length > 0
          ? schedule.daysOfWeek
          : [baseline.getDay()];
      candidate = getNextWeeklyOccurrence(baseline, days, timeOfDay);
      if (candidate <= now) {
        candidate = getNextWeeklyOccurrence(addDays(now, 1), days, timeOfDay);
      }
      break;
    }
    case "monthly": {
      const dayOfMonth = schedule.dayOfMonth || baseline.getDate();
      candidate = getNextMonthlyOccurrence(baseline, dayOfMonth, timeOfDay);
      if (candidate <= now) {
        candidate = getNextMonthlyOccurrence(addDays(now, 1), dayOfMonth, timeOfDay);
      }
      break;
    }
    default:
      return null;
  }

  if (!candidate || Number.isNaN(candidate.getTime())) {
    return null;
  }

  if (start && candidate < withTimeOfDay(start, timeOfDay)) {
    return calculateNextRun(schedule, withTimeOfDay(start, timeOfDay));
  }

  if (candidate <= now) {
    return calculateNextRun(schedule, addMinutes(now, 1));
  }

  return candidate;
};
