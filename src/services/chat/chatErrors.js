export class ChatServiceError extends Error {
  constructor(message, status = 400, code) {
    super(message);
    this.name = "ChatServiceError";
    this.status = status;
    this.code = code;
  }
}
