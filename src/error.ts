export default class GoogleIapAuthError extends Error {
  constructor(message?: string) {
    super(message);
    Object.setPrototypeOf(this, GoogleIapAuthError.prototype);
  }
}
