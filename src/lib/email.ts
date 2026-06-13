// lib/email.ts
import nodemailer from "nodemailer";

export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === "true", // true for 465, false for 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// verify connection on startup
transporter.verify((error) => {
  if (error) {
    console.error("Email connection failed:", error);
  } else {
    console.log("Email server ready");
  }
});
