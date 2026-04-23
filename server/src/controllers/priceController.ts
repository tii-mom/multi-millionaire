import { Request, Response, NextFunction } from 'express';
import { getLatestConfirmedPrice } from '../models/priceModel';

export async function getLatest(req: Request, res: Response, next: NextFunction) {
  try {
    const price = await getLatestConfirmedPrice();
    return res.json({ request_id: req.id || '', data: price });
  } catch (err) {
    return next(err);
  }
}
