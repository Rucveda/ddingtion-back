export class ReportServiceError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "ReportServiceError";
    this.status = status;
  }
}
