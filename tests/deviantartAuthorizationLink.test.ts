import { expect, it } from 'vitest';
import { deviantartAuthorizationAddress } from '../src/features/settings/deviantartNavigation';
import { AUTHORIZATION_URL } from './helpers/deviantartAuthorization';

it.each([
  'https://www.deviantart.com/',
  'https://www.deviantart.com/oauth2/authorize',
  'https://www.deviantart.com/oauth2/authorize?state=only-state',
  'https://other.example/oauth2/authorize',
  'not-a-url-private-fragment',
])('rejects a homepage or incomplete sign-in address without echoing it: %s', (url) => {
  expect(() => deviantartAuthorizationAddress(url)).toThrow(
    'The authorization link is incomplete or invalid. Generate a new sign-in link.',
  );
});

it.each([
  'client_id',
  'response_type',
  'redirect_uri',
  'scope',
  'state',
  'code_challenge',
  'code_challenge_method',
  'view',
])('requires every complete single-valued provider field: %s', (field) => {
  const missing = new URL(AUTHORIZATION_URL);
  missing.searchParams.delete(field);
  expect(() => deviantartAuthorizationAddress(missing.href)).toThrow('incomplete or invalid');
  const duplicate = new URL(AUTHORIZATION_URL);
  duplicate.searchParams.append(field, duplicate.searchParams.get(field)!);
  expect(() => deviantartAuthorizationAddress(duplicate.href)).toThrow('incomplete or invalid');
});

it.each(['client_secret', 'code_verifier', 'access_token', 'refresh_token', 'code'])(
  'never displays an authorization request containing private material: %s',
  (field) => {
    const url = new URL(AUTHORIZATION_URL);
    url.searchParams.set(field, 'private-value');
    expect(() => deviantartAuthorizationAddress(url.href)).toThrow('incomplete or invalid');
  },
);

it('preserves a complete generated request exactly and rejects a non-HTTPS callback', () => {
  expect(deviantartAuthorizationAddress(AUTHORIZATION_URL)).toBe(AUTHORIZATION_URL);
  const url = new URL(AUTHORIZATION_URL);
  url.searchParams.set('redirect_uri', 'http://pi.example/api/deviantart/oauth/callback');
  expect(() => deviantartAuthorizationAddress(url.href)).toThrow('callback must be an HTTPS address');
});
