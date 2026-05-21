import { NotificationServiceError } from "../../services/notifications/notificationErrors.js";

export const sendNotificationError = (res, error, fallbackMessage) => {
  if (error instanceof NotificationServiceError) {
    return res.status(error.status).json({ error: error.message });
  }
  console.error(error);
  return res.status(500).json({ error: fallbackMessage });
};

export const handleNotificationRoute = (handler, fallbackMessage) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    sendNotificationError(res, error, fallbackMessage);
  }
};
