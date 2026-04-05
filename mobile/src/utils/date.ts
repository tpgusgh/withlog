export const formatLocalDate = (value: Date = new Date()) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const formatDisplayDate = (value: Date | string) => {
  const date = typeof value === 'string' ? new Date(value) : value;
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
};

export const formatCreatedAtLabel = (value?: string | null) => {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

export const parseDateKey = (dateKey: string, hour = 0) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1, hour, 0, 0, 0);
};

export const buildRecentHourTimeline = (dateKey: string, hour: number, count = 24) => {
  const anchor = parseDateKey(dateKey, hour);
  return Array.from({ length: count }, (_, index) => {
    const point = new Date(anchor);
    point.setHours(anchor.getHours() - (count - 1 - index));
    return {
      key: `${formatLocalDate(point)}-${point.getHours()}`,
      dateKey: formatLocalDate(point),
      displayDate: formatDisplayDate(point),
      hour: point.getHours(),
      hourLabel: `${point.getHours()}시`,
    };
  });
};
