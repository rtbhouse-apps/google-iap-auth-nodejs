import fetch from 'node-fetch';
import jwt from 'jwt-simple';

import { GoogleIapAuthError } from './error';

export interface GoogleServiceAccountKey {
  private_key_id: string;
  private_key: string;
  client_email: string;
}

interface GoogleIapSession {
  googleIapJwt: string;
  tokenIssuedAtTimestamp: number;
}


export class GoogleIapAuth {
  protected static readonly oauthTokenUri = 'https://www.googleapis.com/oauth2/v4/token';
  protected static readonly jwtBearerTokenGrantType = 'urn:ietf:params:oauth:grant-type:jwt-bearer';

  protected googleIapSession?: GoogleIapSession;

  protected getTokenAsyncPendingPromise?: Promise<string>;

  constructor(
    protected clientId: string,
    protected googleServiceAccountKey: GoogleServiceAccountKey,
    protected tokenSoftExpiration: number = 60 * 30,
    protected tokenHardExpiration: number = 2 * tokenSoftExpiration,
  ) {
    if (this.tokenSoftExpiration > this.tokenHardExpiration) {
      throw new Error('Soft expiration time should NOT be larger than hard expiration time');
    }
  }

  public async getToken(): Promise<string> {
    if (this.getTokenAsyncPendingPromise === undefined) {
      this.getTokenAsyncPendingPromise = this.getTokenAsync();
      const token = await this.getTokenAsyncPendingPromise;
      this.getTokenAsyncPendingPromise = undefined;
      return token;
    }
    return this.getTokenAsyncPendingPromise;
  }
  
  private async getTokenAsync(): Promise<string> {
    const googleIapSession = this.getGoogleIapSessionIfValid() || await this.createGoogleIapSession();
    return googleIapSession.googleIapJwt;
  }

  protected getGoogleIapSessionIfValid(): GoogleIapSession | undefined {
    if (this.googleIapSession === undefined) {
      return undefined;
    }

    if (this.googleIapSession.tokenIssuedAtTimestamp + this.tokenSoftExpiration < GoogleIapAuth.nowTimestamp()) {
      return undefined;
    }

    return this.googleIapSession;
  }

  protected async createGoogleIapSession(): Promise<GoogleIapSession> {
    const jwtAssertion = await this.createJwtAssertion();
    const googleIapJwt = await GoogleIapAuth.getGoogleOpenIdConnectToken(jwtAssertion);
    const tokenIssuedAt = jwt.decode(googleIapJwt, '', true).iat;
    this.googleIapSession = { googleIapJwt, tokenIssuedAtTimestamp: tokenIssuedAt };
    return this.googleIapSession;
  }

  protected async createJwtAssertion(): Promise<string> {
    const now = GoogleIapAuth.nowTimestamp();
    const message = {
      kid: this.googleServiceAccountKey.private_key_id,
      iss: this.googleServiceAccountKey.client_email,
      sub: this.googleServiceAccountKey.client_email,
      aud: GoogleIapAuth.oauthTokenUri,
      iat: now,
      exp: now + this.tokenHardExpiration,
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
      GoogleIapAuth.oauthTokenUri,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: data
      }
    );

    if (!response.ok) {
      let errorMessage: string | undefined = undefined;
      try {
        const responseData = await response.json();
        errorMessage = responseData.error_description;
      } finally {
        errorMessage = errorMessage ?? 'Unexpected response from Google service';
      }
      throw new GoogleIapAuthError(errorMessage);
    }
    const responseData = await response.json();
    return responseData.id_token;
  }

  protected static nowTimestamp(): number {
    return Math.floor(Date.now() / 1000);
  }
}
