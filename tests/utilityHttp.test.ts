import { afterEach, expect, it } from 'vitest';
import { createDeliveryFixture, cleanupDeliveryFixtures } from './helpers/deliveryFixture';
import { UTILITY, UTILITY_ACTION } from '../shared/utilities';
import { HTTP_STATUS } from '../shared/contracts';

afterEach(cleanupDeliveryFixtures);
it(
  'keeps utility preferences private, JSON-only, origin-checked and free ' + 'of filesystem/credential diagnostics',
  async () => {
    const { client, login, directory, configuration } = await createDeliveryFixture();
    await client.get(UTILITY.path).expect(HTTP_STATUS.unauthorized);
    await client
      .post(UTILITY.path)
      .send({ action: UTILITY_ACTION.settings, enabled: true })
      .expect(HTTP_STATUS.unauthorized);
    await login();
    await client
      .post(UTILITY.path)
      .set('Origin', 'https://attacker.example')
      .send({ action: UTILITY_ACTION.settings, enabled: true })
      .expect(HTTP_STATUS.forbidden);
    await client
      .post(UTILITY.path)
      .send({ action: UTILITY_ACTION.settings, enabled: 'yes' })
      .expect(HTTP_STATUS.conflict);
    await client.post(UTILITY.path).send({ action: 'shell', command: 'rm -rf /' }).expect(HTTP_STATUS.conflict);
    await client.post(UTILITY.path).send({ action: UTILITY_ACTION.settings, enabled: true }).expect(HTTP_STATUS.ok);
    const response = await client.get(UTILITY.path).expect(HTTP_STATUS.ok);
    expect(response.body.enabled).toBe(true);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(response.body)).not.toContain(directory);
    expect(JSON.stringify(response.body)).not.toContain(configuration.accessToken);
  },
);
