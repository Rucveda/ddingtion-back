export class PostServiceError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "PostServiceError";
    this.status = status;
  }
}
