const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

const TICKET_PRICES = {
  "Early Bird": 500,
  "Regular": 700,
  "VIP": 1500
};

const payments = {};

app.get("/", (req, res) => {
  res.json({
    status: "online",
    service: "NOVYX M-Pesa Backend"
  });
});

app.get("/api/health", (req, res) => {
  const required = [
    "MPESA_CONSUMER_KEY",
    "MPESA_CONSUMER_SECRET",
    "MPESA_SHORTCODE",
    "MPESA_PASSKEY",
    "MPESA_CALLBACK_URL"
  ];

  const missing = required.filter(
    key => !process.env[key]
  );

  res.json({
    status: missing.length ? "configuration_required" : "ready",
    missing
  });
});

function normalizePhone(phone) {
  phone = String(phone || "")
    .trim()
    .replace(/\s+/g, "");

  if (phone.startsWith("+254")) {
    phone = phone.substring(1);
  }

  if (phone.startsWith("07") || phone.startsWith("01")) {
    phone = "254" + phone.substring(1);
  }

  if (phone.startsWith("7") || phone.startsWith("1")) {
    phone = "254" + phone;
  }

  return phone;
}

function getKenyaTimestamp() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());

  const get = type =>
    parts.find(p => p.type === type).value;

  return (
    get("year") +
    get("month") +
    get("day") +
    get("hour") +
    get("minute") +
    get("second")
  );
}

async function getAccessToken() {
  const credentials = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
  ).toString("base64");

  const response = await axios.get(
    "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
    {
      headers: {
        Authorization: `Basic ${credentials}`
      }
    }
  );

  return response.data.access_token;
}

app.post("/api/stkpush", async (req, res) => {
  try {
    const { ticket, phone: rawPhone } = req.body;

    if (!ticket || !TICKET_PRICES[ticket]) {
      return res.status(400).json({
        success: false,
        message: "Invalid NOVYX ticket."
      });
    }

    const phone = normalizePhone(rawPhone);

    if (!/^254[71]\d{8}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Kenyan M-Pesa number."
      });
    }

    const required = [
      "MPESA_CONSUMER_KEY",
      "MPESA_CONSUMER_SECRET",
      "MPESA_SHORTCODE",
      "MPESA_PASSKEY",
      "MPESA_CALLBACK_URL"
    ];

    const missing = required.filter(
      key => !process.env[key]
    );

    if (missing.length) {
      return res.status(500).json({
        success: false,
        message: "M-Pesa backend is not configured.",
        missing
      });
    }

    const amount = TICKET_PRICES[ticket];
    const accessToken = await getAccessToken();
    const timestamp = getKenyaTimestamp();

    const password = Buffer.from(
      `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`
    ).toString("base64");

    const stkResponse = await axios.post(
      "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
      {
        BusinessShortCode: process.env.MPESA_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: amount,
        PartyA: phone,
        PartyB: process.env.MPESA_SHORTCODE,
        PhoneNumber: phone,
        CallBackURL: process.env.MPESA_CALLBACK_URL,
        AccountReference: "NOVYX",
        TransactionDesc: `${ticket} Ticket`
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      }
    );

    const checkoutRequestID =
      stkResponse.data.CheckoutRequestID;

    payments[checkoutRequestID] = {
      status: "pending",
      ticket,
      amount,
      phone
    };

    res.json({
      success: true,
      message: "M-Pesa payment request sent.",
      checkoutRequestID
    });

  } catch (error) {
    console.error(
      "STK ERROR:",
      error.response?.data || error.message
    );

    res.status(500).json({
      success: false,
      message:
        error.response?.data?.errorMessage ||
        error.response?.data?.ResponseDescription ||
        error.message ||
        "Unable to start payment."
    });
  }
});

app.post("/api/callback", (req, res) => {
  try {
    const callback =
      req.body?.Body?.stkCallback;

    if (callback) {
      const id = callback.CheckoutRequestID;

      if (payments[id]) {
        payments[id].status =
          callback.ResultCode === 0
            ? "success"
            : "failed";

        payments[id].resultCode =
          callback.ResultCode;

        payments[id].resultDesc =
          callback.ResultDesc;

        if (callback.CallbackMetadata?.Item) {
          payments[id].metadata =
            callback.CallbackMetadata.Item;
        }
      }
    }

    res.json({
      ResultCode: 0,
      ResultDesc: "Accepted"
    });

  } catch (error) {
    console.error("CALLBACK ERROR:", error.message);

    res.json({
      ResultCode: 0,
      ResultDesc: "Accepted"
    });
  }
});

app.get(
  "/api/payment-status/:checkoutRequestID",
  (req, res) => {
    const payment =
      payments[req.params.checkoutRequestID];

    if (!payment) {
      return res.json({
        status: "unknown"
      });
    }

    res.json(payment);
  }
);

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `NOVYX backend running on port ${PORT}`
  );
});
