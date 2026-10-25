// UI cards are data-driven: a new supported sensor can be added here without rewriting the layout.
// `field` must match the field sent by the ESP32 into devices/<deviceId>/telemetry/latest.
export const SENSOR_CARDS = [
  {
    id: 'temperature',
    label: 'Water temperature',
    field: 'temperatureC',
    unit: '°C',
    icon: '🌡️',
    description: 'Current sensor reading',
    format: (value) => Number.isFinite(Number(value)) ? Number(value).toFixed(1) : '—',
  },
  {
    id: 'food-weight',
    label: 'Food weight',
    field: 'foodWeightG',
    unit: 'g',
    icon: '⚖️',
    description: 'Load-cell reading',
    format: (value) => Number.isFinite(Number(value)) ? Number(value).toFixed(1) : '—',
  },
  {
    id: 'rtc',
    label: 'RTC time',
    field: 'rtcTime',
    unit: '',
    icon: '🕒',
    description: 'Time reported by the RTC module',
    format: (value) => value === undefined || value === null || value === '' ? '—' : String(value),
  },
];
