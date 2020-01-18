# @rtbhouse/google-iap-auth

Helper library to perfrorm requests to OIDC-authenticated resources (Cloud Identity-Aware Proxy)

## Installation

```shell
npm install @rtbhouse/google-iap-auth
```

## Usage

To use this library you must have the following:

- Identity Aware Proxy protected resource
- Service account with permissions to read protected resource
- OAuth credentials with key file in JSON format (
  [more](https://cloud.google.com/iam/docs/creating-managing-service-account-keys#iam-service-account-keys-create-console)
  on generating Service Account json keys)

Example usage with [got](https://www.npmjs.com/package/got):

```typescript
import fs from 'fs';
import got from "got";
import { GoogleIapAuth } from "@rtbhouse/google-iap-auth";


const keyStr = await fs.readFileSync('key.json', 'utf-8');
const keyData = JSON.parse(keyStr);
const googleIapAuth = new GoogleIapAuth("<oauth_client>", keyData);
const authorizedGot = got.extend({
  hooks: {
    beforeRequest: [
      async options => {
        options.headers.Authorization = `Bearer ${await googleIapAuth.getToken()}`;
      }
    ]
  },
  responseType: "json",
  followRedirect: false,
  mutableDefaults: true
});

(async () => {
  const response = await authorizedGot(
    "https://some.iap.protected.resource.com/"
  );
  console.log(response.statusCode);
  console.log(response.body);
})();
