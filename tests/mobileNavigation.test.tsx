// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { MobileNavigation } from '../src/components/layout/MobileNavigation';
import { StationWorkspace } from '../src/app/StationWorkspace';

afterEach(cleanup);

/**
 * Checks that phone shortcuts reach real workspace sections and retain native keyboard access.
 * @returns {Promise<void>} Completion of keyboard interactions.
 */
it('connects every mobile shortcut to a workspace section using keyboard-accessible links', async () => {
  const user = userEvent.setup();
  render(
    <div>
      <MobileNavigation />
      <main id="main">
        <StationWorkspace
          snapshot={{ jobs: [], storage: { availableBytes: 1, totalBytes: 1 }, concurrency: 1, maximumFileBytes: 1 }}
          busyJobId={null}
          onAdd={vi.fn().mockResolvedValue(undefined)}
          onUpload={vi.fn().mockResolvedValue(undefined)}
          onAction={vi.fn().mockResolvedValue(undefined)}
        />
      </main>
    </div>,
  );
  const navigation = screen.getByRole('navigation', { name: 'Mobile workspace' });
  for (const link of within(navigation).getAllByRole('link')) {
    const destination = link.getAttribute('href')?.slice(1) ?? '';
    expect(document.getElementById(destination)).toBeInTheDocument();
    await user.tab();
    expect(link).toHaveFocus();
  }
});
