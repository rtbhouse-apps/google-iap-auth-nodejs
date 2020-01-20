import jwt from 'jwt-simple';
import nock from 'nock';
import { GoogleIapAuth, GoogleIapAuthError } from '../src/index';


const goodKey = {
  type: 'service_account',
  project_id: 'test',
  private_key_id: '12345',
  private_key: '-----BEGIN PRIVATE KEY-----\nabcdefgh\n-----END PRIVATE KEY-----\n',
  client_email: 'iap-test@test.iam.gserviceaccount.com',
  client_id: '1234567890',
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
  auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
  client_x509_cert_url: 'https://www.googleapis.com/robot/v1/metadata/x509/iap-test%40test.iam.gserviceaccount.com',
};


const badKey = { invalid: 'content' };


beforeAll(() => {
  jwt.decode = jest.fn().mockReturnValue({ iat: Math.floor(Date.now() / 1000) });
  jwt.encode = jest.fn().mockReturnValue('encodedmessage');
});


test('read JSON key file with invalid content', async () => {
  expect(() => {
    // @ts-ignore
    new GoogleIapAuth('testId', badKey);
  }).toThrowError(new GoogleIapAuthError('Invalid JSON key file format'));
});


test('handles error returned by Google service', async () => {
  nock('https://www.googleapis.com')
    .post('/oauth2/v4/token')
    .reply(400, JSON.stringify({ unexpected: 'data' }));

  const googleIapAuth = new GoogleIapAuth('testId', goodKey);

  await expect(googleIapAuth.getToken())
    .rejects.toThrowError(new GoogleIapAuthError('Unexpected response from Google service'));
});


test('returns valid token from Google service', async () => {
  const token = 'sometoken';
  nock('https://www.googleapis.com')
    .post('/oauth2/v4/token')
    .reply(200, JSON.stringify({ id_token: token }));

  const googleIapAuth = new GoogleIapAuth('testId', goodKey);

  await expect(googleIapAuth.getToken()).resolves.toEqual(token);
});


test('uses cached token for subsequent calls', async () => {
  const token = 'sometoken';
  nock('https://www.googleapis.com')
    .post('/oauth2/v4/token')
    .reply(200, JSON.stringify({ id_token: token }));

  const googleIapAuth = new GoogleIapAuth('testId', goodKey);
  const spy = jest.spyOn<any, string>(GoogleIapAuth, 'getGoogleOpenIdConnectToken');

  await expect(googleIapAuth.getToken()).resolves.toEqual(token);
  await expect(googleIapAuth.getToken()).resolves.toEqual(token);
  expect(spy).toHaveBeenCalledTimes(1);
});
