// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { SystemMetrics } from '../src/features/health/SystemMetrics';
import type { SystemHealth } from '../shared/health';

const CPU_THREADS = 4;
const UPTIME = 3_661;
const TOTAL_MEMORY = 1_024;
const FREE_MEMORY = 512;
const LOAD_ONE = 0.5;
const LOAD_FIVE = 1;
const LOAD_FIFTEEN = 2;
const TEMPERATURE = 42.125;
const snapshot: SystemHealth = {
  checkedAt: '2026-10-18T12:00:00Z',
  cpuThreads: CPU_THREADS,
  loadAverage: [LOAD_ONE, LOAD_FIVE, LOAD_FIFTEEN],
  uptimeSeconds: UPTIME,
  memory: { totalBytes: TOTAL_MEMORY, freeBytes: FREE_MEMORY },
  temperature: { celsius: TEMPERATURE, detail: 'Read from a recognized CPU thermal sensor.' },
};
afterEach(cleanup);

it('separates OS readings from process data and formats CPU load, memory, temperature and sample time', () => {
  render(<SystemMetrics system={snapshot} />);
  const region = screen.getByRole('region', { name: 'System view' });
  expect(within(region).getByText('0.50 / 1.00 / 2.00')).toBeVisible();
  expect(within(region).getByText('42.1 °C')).toBeVisible();
  expect(within(region).getByText('1h 1m')).toBeVisible();
  expect(within(region).getByText('512 B')).toBeVisible();
  expect(within(region).getByText('1.0 KiB')).toBeVisible();
  expect(within(region).getByText(/not CPU utilization percentages/)).toBeVisible();
  expect(region.querySelector('time')).toHaveAttribute('datetime', snapshot.checkedAt);
});

it('preserves valid zero readings instead of turning them into unavailable placeholders', () => {
  render(
    <SystemMetrics
      system={{
        ...snapshot,
        loadAverage: [0, 0, 0],
        uptimeSeconds: 0,
        memory: { totalBytes: TOTAL_MEMORY, freeBytes: 0 },
        temperature: { celsius: 0, detail: 'Valid zero.' },
      }}
    />,
  );
  expect(screen.getByText('0.0 °C')).toBeVisible();
  expect(screen.getByText('0.00 / 0.00 / 0.00')).toBeVisible();
  expect(screen.getByText('0 B')).toBeVisible();
  expect(screen.getByText('<1m')).toBeVisible();
});

it('shows explicit unavailable measurements, sensor guidance and a fallback for older backends', () => {
  const view = render(
    <SystemMetrics
      system={{
        ...snapshot,
        cpuThreads: null,
        loadAverage: null,
        uptimeSeconds: null,
        memory: { totalBytes: null, freeBytes: null },
        temperature: { celsius: null, detail: 'Optional sensor access may help.' },
      }}
    />,
  );
  const metricCount = 6;
  expect(screen.getAllByText('Unavailable')).toHaveLength(metricCount);
  expect(screen.getByText('Optional sensor access may help.')).toBeVisible();
  view.rerender(<SystemMetrics system={undefined} />);
  expect(screen.getByText(/Update the station and refresh/)).toBeVisible();
});
