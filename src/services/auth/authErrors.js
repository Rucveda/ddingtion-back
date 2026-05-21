export class AuthServiceError extends Error {
  constructor(message, status = 400, code) {
    super(message);
    this.name = "AuthServiceError";
    this.status = status;
    this.code = code;
  }
}
