import { ChatServiceError } from "../../services/chat/chatErrors.js";
import { ReportServiceError } from "../../services/trade/reportErrors.js";

export const sendChatError = (res, error, fallbackMessage) => {
  if (error instanceof ChatServiceError || error instanceof ReportServiceError) {
    const body = { error: error.message };
    if (error.code) body.code = error.code;
    return res.status(error.status).json(body);
  }
  console.error(error);
  return res.status(500).json({ error: fallbackMessage });
};

export const handleChatRoute = (handler, fallbackMessage) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    sendChatError(res, error, fallbackMessage);
  }
};
