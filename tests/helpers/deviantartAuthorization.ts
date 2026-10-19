import { DEVIANTART_OAUTH } from '../../shared/deviantartOAuth';
/** Complete public proof fields model the actual server request without user credentials or network access. */
export const AUTHORIZATION_URL =
  'https://www.deviantart.com/oauth2/authorize?' +
  new URLSearchParams({
    client_id: '123456',
    response_type: 'code',
    redirect_uri: DEVIANTART_OAUTH.landing,
    scope: 'browse',
    view: 'login',
    state: 'S'.repeat(DEVIANTART_OAUTH.proofCharacters),
    code_challenge: 'C'.repeat(DEVIANTART_OAUTH.proofCharacters),
    code_challenge_method: 'S256',
  }).toString();
