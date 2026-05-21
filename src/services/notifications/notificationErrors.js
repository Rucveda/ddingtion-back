export class NotificationServiceError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "NotificationServiceError";
    this.status = status;
  }
}
