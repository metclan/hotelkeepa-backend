import express from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./auth.js";
import { indexRouter } from "./routes/v1/index.js";
import { requireAuth } from "./middleware/middleware.js";
import { userRouter } from "./routes/v1/user.route.js";

import { bachsWebhook } from "./controllers/subscription.controller.js";

const app = express();
const PORT = process.env.PORT || 5001;

app.use(
  cors({
    origin: [
      process.env.FRONTEND_URL!,
      "https://www.hotelkeepa.com",
      "https://hotelkeepa.com",
    ],
    credentials: true,
  }),
);
// Mount as a route so Express preserves the full URL, including query parameters.
app.all("/api/auth/{*any}", toNodeHandler(auth));
// Allow a small inline hotel logo only on the onboarding endpoint.
app.use("/api/v1/onboard/business", express.json({ limit: "300kb" }));
app.use("/api/v1/products", express.json({ limit: "300kb" }));
app.post("/api/v1/webhooks/bachs", express.raw({ type: "application/json" }), bachsWebhook);
app.use(express.json());
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "OK" });
});
app.use("/api/v1/users", userRouter);
app.use("/api/v1/", requireAuth, indexRouter);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
