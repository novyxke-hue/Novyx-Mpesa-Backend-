const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors({
  origin: "https://novyxke-hue.github.io"
}));

app.use(express.json());

const PORT = process.env.PORT || 3000;

const prices = {
  early: 500,
  regular: 700,
  vip: 1500,
  vvip: 2500
};

async function getAccessToken() {
  const auth = Buffer.from(
    `${process.env.CONSUMER_KEY}:${process.env.CONSUMER_SECRET}`
  ).toString("base64");

  const response = await axios.get(
    "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
    {
      headers: {
        Authorization: `Basic ${auth}`
      }
    }
  );

  return response.data.access_token;
}

app.get("/", (req, res) => {
  res.json({
    status: "online",
    service: "NOVYX M-Pesa Backend"
  });
});

app.post("/api/stkpush", async (req, res) => {
  try {
    const { phone, ticket } = req.body;

    if (!phone || !ticket) {
      return res.status(400).json({
        error: "Phone number and ticket are required"
      });
    }

    const amount = prices[ticket];

    if (!amount) {
      return res.status(400).json({
        error: "Invalid ticket type"
      });
    }

    let formattedPhone = phone.replace(/\s+/g, "");

    if (formattedPhone.startsWith("07")) {
      formattedPhone = "254" + formattedPhone.substring(1);
    }

    if (formattedPhone.startsWith("+254")) {
      formattedPhone = formattedPhone.substring(1);
    }

    if (!/^2547\d{8}$/.test(formattedPhone)) {
      return res.status(400).json({
        error: "Enter a valid Kenyan M-Pesa number"
      });
    }

    const token = await getAccessToken();

    const timestamp = new Date()
      .toISOString()
      .replace(/[-:TZ.]/g, "")
      .substring(0, 14);

    const password = Buffer.from(
      `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`
    ).toString("base64");

    const response = await axios.post(
      "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
      {
        BusinessShortCode: process.env.MPESA_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: amount,
        PartyA: formattedPhone,
        PartyB: process.env.MPESA_SHORTCODE,
        PhoneNumber: formattedPhone,
        CallBackURL: process.env.CALLBACK_URL,
        AccountReference: "NOVYX",
        TransactionDesc: `NOVYX ${ticket} ticket`
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.json(response.data);

  } catch (error) {
    console.error(
      error.response?.data || error.message
    );

    res.status(500).json({
      error: "Unable to start M-Pesa payment",
      details: error.response?.data || error.message
    });
  }
});

app.post("/api/callback", (req, res) => {
  console.log("M-Pesa callback:", JSON.stringify(req.body));

  res.json({
    ResultCode: 0,
    ResultDesc: "Accepted"
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`NOVYX backend running on port ${PORT}`);
});
