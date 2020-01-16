import fs from 'fs';
import https from 'https';
import jwt from 'jwt-simple';
import camelCase from 'lodash.camelcase';

import GoogleIapAuthError from './error';


interface KeyData {
  type: string;
  projectId: string;
  privateKeyId: string;
  privateKey: string;
  clientEmail: string;
  clientId: string;
  authUri: string;
  tokenUri: string;
  authProviderX509CertUrl: string;
  clientX509CertUrl: string;
}


export default class GoogleIapAuth {
  protected static readonly oauthTokenUri = 'https://www.googleapis.com/oauth2/v4/token';

  protected static readonly jwtBearerTokenGrantType = 'urn:ietf:params:oauth:grant-type:jwt-bearer';

  protected googleIapJwt?: string;

  /* eslint-disable no-useless-constructor, no-unused-vars, no-empty-function */
  constructor(
    protected clientId: string,
    protected keyFile: string,
    protected tokenSoftExpiration = 30 * 60,
  ) {}
  /* eslint-enable */

  public async getToken(): Promise<string> {
    if (this.googleIapJwt && !this.isJwtExpired(this.googleIapJwt)) {
      return this.googleIapJwt;
    }
    const keyData = await this.readKeyData();
    const jwtAssertion = await this.getJwtAssertion(keyData);
    this.googleIapJwt = await GoogleIapAuth.getGoogleOpenIdConnectToken(jwtAssertion);
    return this.googleIapJwt;
  }

  protected isJwtExpired(jwtToken: string): boolean {
    return jwt.decode(jwtToken, '', true).iat + this.tokenSoftExpiration > this.nowTimestamp();
  }

  protected async readKeyData(): Promise<KeyData> {
    const keyStr = await fs.promises.readFile(this.keyFile, 'utf-8');
    const keyRawData = JSON.parse(keyStr);
    const keyData = Object.assign(
      {},
      ...Object.entries(keyRawData).map(([k, v]) => ({ [camelCase(k)]: v })),
    );
    if (
      keyData.privateKey === undefined
      || keyData.privateKey === undefined
      || keyData.clientEmail === undefined
    ) {
      throw new GoogleIapAuthError('Invalid JSON key file format');
    }
    return keyData;
  }

  protected async getJwtAssertion(keyData: KeyData): Promise<string> {
    const message = {
      kid: keyData.privateKeyId,
      iss: keyData.clientEmail,
      sub: keyData.clientEmail,
      aud: GoogleIapAuth.oauthTokenUri,
      iat: this.nowTimestamp(),
      exp: this.nowTimestamp() + 60 * 60,
      target_audience: this.clientId,
    };
    return jwt.encode(message, keyData.privateKey, 'RS256');
  }

  protected static async getGoogleOpenIdConnectToken(jwtAssertion: string): Promise<string> {
    const data = JSON.stringify({
      assertion: jwtAssertion,
      grant_type: GoogleIapAuth.jwtBearerTokenGrantType,
    });

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
      },
    };
    return new Promise<string>((resolve, reject) => {
      const req = https.request(GoogleIapAuth.oauthTokenUri, options, (res) => {
        res.setEncoding('utf-8');
        let responseBody = '';

        res.on('data', (chunk) => {
          responseBody += chunk;
        });

        res.on('end', () => {
          try {
            const bodyData = JSON.parse(responseBody);
            if (res.statusCode === 200) {
              resolve(bodyData.id_token);
            } else {
              reject(new GoogleIapAuthError(bodyData.error_description));
            }
          } catch (err) {
            reject(new GoogleIapAuthError('Unexpected response from Google service'));
          }
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.write(data);
      req.end();
    });
  }

  protected nowTimestamp = () => Math.floor(Date.now() / 1000);
}
