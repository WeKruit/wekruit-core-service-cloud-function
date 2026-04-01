import type { Response } from 'express';

export function sendJson(
  res: Response,
  status: number,
  payload: Record<string, unknown>,
) {
  return res.status(status).json(payload);
}
