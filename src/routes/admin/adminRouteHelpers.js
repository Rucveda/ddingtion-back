import { AdminServiceError } from "../../services/admin/adminErrors.js";
import { ReportServiceError } from "../../services/trade/reportErrors.js";

export const sendAdminError = (res, error, fallbackMessage) => {
  if (error instanceof AdminServiceError || error instanceof ReportServiceError) {
    return res.status(error.status).json({ error: error.message });
  }
  if (error?.status && error?.message) {
    return res.status(error.status).json({ error: error.message });
  }
  console.error(error);
  return res.status(500).json({ error: fallbackMessage });
};

export const handleAdminRoute = (handler, fallbackMessage) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    sendAdminError(res, error, fallbackMessage);
  }
};
