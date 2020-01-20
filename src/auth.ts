import fetch from 'node-fetch';
import jwt from 'jwt-simple';

import { GoogleIapAuthError } from './error';


const ONE_HOUR = 60 * 60;
const HALF_HOUR = 30 * 60;


export interface GoogleServiceAccountKey {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}


export class GoogleIapAuth {
  protected static readonly oauthTokenUri = 'https://www.googleapis.com/oauth2/v4/token';
  protected static readonly jwtBearerTokenGrantType = 'urn:ietf:params:oauth:grant-type:jwt-bearer';

  protected tokenSoftExpiration: number;
  protected googleIapJwt?: string;
  protected tokenIssuedAt?: number;
  protected getTokenAsyncPromise?: Promise<string>;

  constructor(
    protected clientId: string,
    protected googleServiceAccountKey: GoogleServiceAccountKey,
    tokenSoftExpiration = HALF_HOUR
  ) {
    if (
      googleServiceAccountKey.private_key === undefined
      || googleServiceAccountKey.private_key_id === undefined
      || googleServiceAccountKey.client_email === undefined
    ) {
      throw new GoogleIapAuthError('Invalid JSON key file format');
    }
    this.tokenSoftExpiration = Math.min(tokenSoftExpiration, ONE_HOUR);
  }

  public async getToken(): Promise<string> {
    if (this.getTokenAsyncPromise === undefined) {
      this.getTokenAsyncPromise = this.getTokenAsync();
      const result = await this.getTokenAsyncPromise;
      this.getTokenAsyncPromise = undefined;
      return result;
    }
    return this.getTokenAsyncPromise;
  }

  private async getTokenAsync(): Promise<string> {
    if (this.googleIapJwt && !this.isJwtExpired()) {
      return this.googleIapJwt;
    }
    const jwtAssertion = await this.createJwtAssertion();
    this.googleIapJwt = await GoogleIapAuth.getGoogleOpenIdConnectToken(jwtAssertion);
    this.tokenIssuedAt = jwt.decode(this.googleIapJwt, '', true).iat;
    return this.googleIapJwt;
  }

  protected isJwtExpired(): boolean {
    return (
      this.tokenIssuedAt! + this.tokenSoftExpiration < this.nowTimestamp()
    );
  }

  protected async createJwtAssertion(): Promise<string> {
    const message = {
      kid: this.googleServiceAccountKey.private_key_id,
      iss: this.googleServiceAccountKey.client_email,
      sub: this.googleServiceAccountKey.client_email,
      aud: GoogleIapAuth.oauthTokenUri,
      iat: this.nowTimestamp(),
      exp: this.nowTimestamp() + ONE_HOUR,
      target_audience: this.clientId,
    };
    return jwt.encode(message, this.googleServiceAccountKey.private_key, 'RS256');
  }

  protected static async getGoogleOpenIdConnectToken(jwtAssertion: string): Promise<string> {
    const data = JSON.stringify({
      assertion: jwtAssertion,
      grant_type: GoogleIapAuth.jwtBearerTokenGrantType,
    });
    const response = await fetch(
      this.oauthTokenUri,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: data
      }
    );
    const responseData = await response.json();
    if (!response.ok) {
      const errMessage = responseData.error_description ?? 'Unexpected response from Google service';
      throw(new GoogleIapAuthError(errMessage));
    }
    return responseData.id_token;
  }

  protected nowTimestamp = () => Math.floor(Date.now() / 1000);
}
