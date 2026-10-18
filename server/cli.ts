import { loadServerConfig } from './config.js';
import { runStationCommand } from './control/client.js';

const PROCESS_ARGUMENT_OFFSET = 2;
runStationCommand(loadServerConfig(), process.argv.slice(PROCESS_ARGUMENT_OFFSET)).then(
  (message) => process.stdout.write(`${message}\n`),
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Station command failed.'}\n`);
    process.exitCode = 1;
  },
);
