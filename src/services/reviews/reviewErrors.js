export class ReviewServiceError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "ReviewServiceError";
    this.status = status;
  }
}
