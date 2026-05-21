export class AdminServiceError extends Error {
  constructor(message, status = 400, code) {
    super(message);
    this.name = "AdminServiceError";
    this.status = status;
    this.code = code;
  }
}
