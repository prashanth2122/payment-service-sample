import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import cookieParser from 'cookie-parser';
import { paymentsRouter, webhookRawHandler } from './payments';

dotenv.config();

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const app = express();

app.use(helmet());
app.use(cookieParser());
app.set('trust proxy', true);
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60
});
app.use(limiter);
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "script-src": [
          "'self'",
          "'unsafe-inline'",           
          "https://checkout.razorpay.com"
        ],
        "style-src": [
          "'self'",
          "'unsafe-inline'"               
        ],
        "frame-src": [
          "'self'",
          "https://api.razorpay.com",
          "https://checkout.razorpay.com"
        ],
        "connect-src": ["'self'", "https://api.razorpay.com"],
        "img-src": ["'self'", "data:", "https:"]
      },
    },
  })
);
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/api/payments', paymentsRouter);
app.get("/config", (req, res) => {
  res.json({ key: process.env.RAZORPAY_KEY_ID });
});
app.post('/webhook/razorpay', express.raw({ type: 'application/json' }), webhookRawHandler);

app.get('/health', (_, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});
