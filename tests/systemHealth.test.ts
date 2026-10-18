import os from 'node:os';
import { mkdtempSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { collectSystemHealth, parseTemperature, SystemInspector, THERMAL_DIRECTORIES } from '../server/health/system';
import { readKernelField } from '../server/health/kernelField';
import { SYSTEM_LIMIT } from '../shared/health';
import { API_PATH, HTTP_STATUS } from '../shared/contracts';
import { EngineInspector } from '../server/health/engines';
import { createDeliveryFixture, cleanupDeliveryFixtures } from './helpers/deliveryFixture';

const CPU_THREADS = 4;
const TOTAL_MEMORY = 1_024;
const FREE_MEMORY = 512;
const UPTIME = 3_661;
const FRACTIONAL_UPTIME = 3_661.9;
const LOAD_ONE = 0.5;
const LOAD_FIVE = 1;
const LOAD_FIFTEEN = 2;
const TEMPERATURE = 42.125;
const LOAD = [LOAD_ONE, LOAD_FIVE, LOAD_FIFTEEN];
const TWO = 2;
const NO_TEMPERATURE = { celsius: null, detail: 'No readable sensor.' };
const directories: string[] = [];
beforeEach(() => {
  vi.spyOn(os, 'cpus').mockReturnValue(
    Array.from({ length: CPU_THREADS }, () => ({
      model: 'Do not expose CPU identification',
      speed: 1,
      times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 },
    })),
  );
  vi.spyOn(os, 'loadavg').mockReturnValue(LOAD);
  vi.spyOn(os, 'uptime').mockReturnValue(FRACTIONAL_UPTIME);
  vi.spyOn(os, 'totalmem').mockReturnValue(TOTAL_MEMORY);
  vi.spyOn(os, 'freemem').mockReturnValue(FREE_MEMORY);
});
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }));
  await cleanupDeliveryFixtures();
});

it('captures OS-visible counts and load without exposing model, hostname, paths or process data', () => {
  const snapshot = collectSystemHealth(NO_TEMPERATURE);
  expect(snapshot).toMatchObject({
    cpuThreads: CPU_THREADS,
    loadAverage: LOAD,
    uptimeSeconds: UPTIME,
    memory: { totalBytes: TOTAL_MEMORY, freeBytes: FREE_MEMORY },
  });
  expect(JSON.stringify(snapshot)).not.toContain('Do not expose');
  expect(Object.keys(snapshot).sort()).toEqual([
    'checkedAt',
    'cpuThreads',
    'loadAverage',
    'memory',
    'temperature',
    'uptimeSeconds',
  ]);
});

it('isolates unavailable native counters and rejects invalid load values or impossible memory readings', () => {
  vi.mocked(os.cpus).mockImplementationOnce(() => {
    throw new Error('private/path');
  });
  vi.mocked(os.loadavg).mockReturnValueOnce([Infinity, LOAD_FIVE, LOAD_FIFTEEN]);
  vi.mocked(os.freemem).mockReturnValueOnce(TOTAL_MEMORY + 1);
  expect(collectSystemHealth(NO_TEMPERATURE)).toMatchObject({
    cpuThreads: null,
    loadAverage: null,
    uptimeSeconds: UPTIME,
    memory: { totalBytes: TOTAL_MEMORY, freeBytes: null },
  });
  vi.mocked(os.uptime).mockReturnValueOnce(-1);
  vi.mocked(os.totalmem).mockImplementationOnce(() => {
    throw new Error('private/path');
  });
  vi.mocked(os.freemem).mockReturnValueOnce(0);
  expect(collectSystemHealth(NO_TEMPERATURE)).toMatchObject({
    uptimeSeconds: null,
    memory: { totalBytes: null, freeBytes: 0 },
  });
});

it('treats Windows load averages and missing CPU arrays as unavailable instead of a fake zero load', async () => {
  vi.mocked(os.cpus).mockReturnValue([]);
  const reader = vi.fn();
  const snapshot = await new SystemInspector(reader, 'win32').inspect();
  expect(snapshot).toMatchObject({ cpuThreads: null, loadAverage: null, temperature: { celsius: null } });
  expect(os.loadavg).not.toHaveBeenCalled();
  expect(reader).not.toHaveBeenCalled();
});

it.each([null, '', 'NaN', 'Infinity', '42000.5', '0xa410', '4.2e4', '42000 °C', '42000\n1', '-40001', '150001'])(
  'rejects malformed or implausible thermal input %#',
  (value) => {
    expect(parseTemperature(value)).toBeNull();
  },
);

it('preserves valid zero, millidegree precision and explicit parser boundary values', () => {
  expect(parseTemperature('42125')).toBe(TEMPERATURE);
  expect(parseTemperature('0')).toBe(0);
  for (const boundary of [SYSTEM_LIMIT.minimumCelsius, SYSTEM_LIMIT.maximumCelsius]) {
    expect(parseTemperature(String(boundary * SYSTEM_LIMIT.millidegreesPerDegree))).toBe(boundary);
  }
});

it('reads bounded real files and rejects overflow, symlinks, directories and missing paths', async () => {
  const directory = mkdtempSync(path.resolve('tests/.system-field-'));
  directories.push(directory);
  const filename = path.join(directory, 'temp');
  writeFileSync(filename, '42125\n');
  expect(await readKernelField(filename)).toBe('42125');
  writeFileSync(filename, 'x'.repeat(SYSTEM_LIMIT.fieldBytes));
  expect((await readKernelField(filename))?.length).toBe(SYSTEM_LIMIT.fieldBytes);
  writeFileSync(filename, 'x'.repeat(SYSTEM_LIMIT.fieldBytes + 1));
  expect(await readKernelField(filename)).toBeNull();
  const link = path.join(directory, 'linked');
  symlinkSync(filename, link);
  expect(await readKernelField(link)).toBeNull();
  expect(await readKernelField(directory)).toBeNull();
  expect(await readKernelField(path.join(directory, 'missing'))).toBeNull();
});

it('prefers the explicit mounted CPU sensor and never returns raw type strings or filesystem paths', async () => {
  const reader = vi.fn().mockResolvedValueOnce('cpu-thermal').mockResolvedValueOnce('42125');
  const snapshot = await new SystemInspector(reader, 'linux').inspect();
  expect(snapshot.temperature.celsius).toBe(TEMPERATURE);
  expect(reader.mock.calls.map(([filename]) => filename)).toEqual([
    `${THERMAL_DIRECTORIES[0]}/type`,
    `${THERMAL_DIRECTORIES[0]}/temp`,
  ]);
  expect(JSON.stringify(snapshot)).not.toContain(THERMAL_DIRECTORIES[0]);
  expect(JSON.stringify(snapshot)).not.toContain('cpu-thermal');
});

it('skips an unrecognized thermal type and uses a recognized native CPU zone instead', async () => {
  const reader = vi
    .fn()
    .mockResolvedValueOnce('acpitz')
    .mockResolvedValueOnce('cpu_thermal')
    .mockResolvedValueOnce('0');
  const snapshot = await new SystemInspector(reader, 'linux').inspect();
  expect(snapshot.temperature.celsius).toBe(0);
  expect(reader.mock.calls.map(([filename]) => filename)).toEqual([
    `${THERMAL_DIRECTORIES[0]}/type`,
    `${THERMAL_DIRECTORIES[1]}/type`,
    `${THERMAL_DIRECTORIES[1]}/temp`,
  ]);
});

it('keeps independent metrics usable when sensors are missing or inaccessible', async () => {
  const reader = vi.fn().mockRejectedValue(new Error('/private/kernel/path is unreadable'));
  const snapshot = await new SystemInspector(reader, 'linux').inspect();
  expect(snapshot).toMatchObject({ cpuThreads: CPU_THREADS, loadAverage: LOAD, temperature: { celsius: null } });
  expect(JSON.stringify(snapshot)).not.toContain('/private');
});

it('coalesces probes, isolates returned values and samples again only after the short cache expires', async () => {
  vi.useFakeTimers();
  const reader = vi
    .fn()
    .mockImplementation(async (filename: string) => (filename.endsWith('/type') ? 'cpu-thermal' : '42125'));
  const inspector = new SystemInspector(reader, 'linux');
  const [first, second] = await Promise.all([inspector.inspect(), inspector.inspect()]);
  expect(reader).toHaveBeenCalledTimes(TWO);
  expect(first).toEqual(second);
  first.temperature.celsius = 0;
  expect((await inspector.inspect()).temperature.celsius).toBe(TEMPERATURE);
  await vi.advanceTimersByTimeAsync(SYSTEM_LIMIT.cacheMilliseconds);
  await inspector.inspect();
  expect(reader).toHaveBeenCalledTimes(TWO * TWO);
});

it('bounds response time and avoids accumulating probes while a timed-out physical read is still pending', async () => {
  vi.useFakeTimers();
  let release: ((value: string | null) => void) | undefined;
  const reader = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<string | null>((resolve) => {
          release = resolve;
        }),
    )
    .mockResolvedValue(null);
  const inspector = new SystemInspector(reader, 'linux');
  const pending = inspector.inspect();
  await vi.advanceTimersByTimeAsync(SYSTEM_LIMIT.probeTimeoutMilliseconds);
  expect((await pending).temperature).toMatchObject({ celsius: null, detail: expect.stringContaining('in time') });
  await vi.advanceTimersByTimeAsync(SYSTEM_LIMIT.cacheMilliseconds);
  expect((await inspector.inspect()).cpuThreads).toBe(CPU_THREADS);
  expect(reader).toHaveBeenCalledTimes(1);
  release?.(null);
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(SYSTEM_LIMIT.cacheMilliseconds);
  await inspector.inspect();
  expect(reader.mock.calls.length).toBeGreaterThan(1);
});

it('keeps system details private and leaves the public health probe unchanged', async () => {
  const inspect = vi.spyOn(SystemInspector.prototype, 'inspect').mockResolvedValue(collectSystemHealth(NO_TEMPERATURE));
  vi.spyOn(EngineInspector.prototype, 'inspect').mockResolvedValue([]);
  const fixture = await createDeliveryFixture();
  await fixture.client.get(API_PATH.station).expect(HTTP_STATUS.unauthorized);
  expect(inspect).not.toHaveBeenCalled();
  const probe = await fixture.client.get(API_PATH.health).expect(HTTP_STATUS.ok);
  expect(probe.body).toEqual({ status: 'ok' });
  await fixture.login();
  const response = await fixture.client.get(API_PATH.station).expect(HTTP_STATUS.ok);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.body.system).toMatchObject({ cpuThreads: CPU_THREADS, memory: { totalBytes: TOTAL_MEMORY } });
  expect(response.text).not.toContain(fixture.directory);
});
