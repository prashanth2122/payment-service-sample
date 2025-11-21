import express, { Request, Response } from 'express';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();
const router = express.Router();

const key_id = process.env.RAZORPAY_KEY_ID!;
const key_secret = process.env.RAZORPAY_KEY_SECRET!;
const webhookSecret = process.env.WEBHOOK_SECRET || '';

if (!key_id || !key_secret) {
  throw new Error('Missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET in env');
}

const razorpay = new Razorpay({
  key_id,
  key_secret,
});

// Step 1
// POST /api/payments/create-order  { amount, currency, receiptId? }
router.post('/create-order', async (req: Request, res: Response) => {
  try {
    const { amount, currency = 'INR', receipt } = req.body;
    if (!amount || typeof amount !== 'number') {
      return res.status(400).json({ error: 'amount (number, in smallest currency unit) required' });
    }

    // Build order payload
    const options = {
      amount, // amount in paise for INR (100 = ₹1.00)
      currency,
      receipt: receipt || `rcpt_${Date.now()}`,
      payment_capture: 1 // 1 => auto-capture; use 0 for manual capture
    };

    const order = await razorpay.orders.create(options);
    res.json({ order });
  } catch (err: any) {
    console.error('create-order error', err);
    res.status(500).json({ error: 'could not create order', details: err.message });
  }
});
// Step 2
router.post('/verify', (req: Request, res: Response) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'missing parameters' });
  }

  const generated_signature = crypto
    .createHmac('sha256', key_secret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (generated_signature === razorpay_signature) {
    return res.json({ ok: true, msg: 'signature verified' });
  } else {
    return res.status(400).json({ ok: false, msg: 'invalid signature' });
  }
});

export const webhookRawHandler = (req: Request, res: Response) => {
  try {
    // req.body is Buffer because express.raw used
    const payload = (req as any).body as Buffer;
    const signature = req.headers['x-razorpay-signature'] as string | undefined;

    if (!signature) {
      console.warn('Webhook missing signature');
      return res.status(400).send('missing signature');
    }

const expected = crypto.createHmac('sha256', webhookSecret).update(Buffer.isBuffer(payload) ? payload : JSON.stringify(payload)).digest('hex');

    if (expected !== signature) {
      console.warn('Invalid webhook signature');
      return res.status(400).send('invalid signature');
    }
    console.log('WEBHOOK RECEIVED:', payload.event);
    res.status(200).send('ok');
  } catch (err: any) {
    console.error('webhook handler error', err);
    res.status(500).send('err');
  }
};
export const paymentsRouter = router;
export const payments = router;
