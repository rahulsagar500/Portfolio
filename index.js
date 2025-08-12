// index.js
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

/* ---------------- Security + parsing ---------------- */
app.use(
  helmet({
    // Allow Tailwind CDN, Google Fonts, and your inline Tailwind config <script>
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "script-src": [
          "'self'",
          "'unsafe-inline'",            // needed for the small inline tailwind.config script in <head>
          "https://cdn.tailwindcss.com" // Tailwind CDN
        ],
        "style-src": [
          "'self'",
          "'unsafe-inline'",            // allow inline <style> used in your page
          "https://fonts.googleapis.com"
        ],
        "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
        "img-src": ["'self'", "data:"],
        "connect-src": ["'self'"],      // fetch to your own /api
        // keep other defaults (frame-ancestors, object-src, etc.)
      },
    },
    crossOriginEmbedderPolicy: false,   // prevents some font loads from being blocked
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// If frontend is served from the same server, permissive is fine.
// If you host frontend elsewhere, set origin: "https://yourdomain"
app.use(cors({ origin: true }));

/* ---------------- Static files ---------------- */
app.use(express.static(path.join(__dirname, "public")));

/* ---------------- Rate limit for contact endpoint ---------------- */
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,             // 10 requests/minute
});
app.use("/api/contact", limiter);

/* ---------------- Env check ---------------- */
const requiredVars = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "TO_EMAIL",
  "FROM_EMAIL",
];
for (const v of requiredVars) {
  if (!process.env[v]) {
    console.error(`Missing env var: ${v}`);
  }
}

/* ---------------- Nodemailer transport ---------------- */
const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: Number(process.env.SMTP_PORT) === 465, // 465 -> SSL
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/* ---------------- API: Contact ---------------- */
app.post("/api/contact", async (req, res) => {
  try {
    const { name, email, subject, message } = req.body || {};
    if (!name || !email || !message) {
      return res.status(400).json({ ok: false, error: "Missing fields." });
    }

    const html = `
      <div style="font-family:Inter,Arial,sans-serif;padding:16px">
        <h2>New Portfolio Message</h2>
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        ${subject ? `<p><strong>Subject:</strong> ${escapeHtml(subject)}</p>` : ""}
        <hr style="border:none;border-top:1px solid #eee;margin:16px 0" />
        <p style="white-space:pre-wrap">${escapeHtml(message)}</p>
      </div>
    `;

    await transport.sendMail({
      from: `"Portfolio Contact" <${process.env.FROM_EMAIL}>`,
      to: process.env.TO_EMAIL, // e.g., rahulsagarpabba5@gmail.com
      subject: subject ? `[Portfolio] ${subject}` : "[Portfolio] New message",
      replyTo: email,
      html,
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error("Email send failed:", err);
    return res.status(500).json({ ok: false, error: "Failed to send email." });
  }
});

/* ---------------- SPA fallback ---------------- */
app.get("*", (_, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* ---------------- Start server ---------------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Server running → http://localhost:${PORT}`)
);

/* ---------------- Utils ---------------- */
function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
