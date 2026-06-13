import express from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./auth.js";
import { indexRouter } from "./routes/v1/index.js";
import { requireAuth, loadPermissions } from "./middleware/middleware.js";
import { userRouter } from "./routes/v1/user.route.js";
const app = express();
const PORT = process.env.PORT || 5001;
app.use(cors({
    origin: ["http://localhost:3000", "https://gadgetkeep.com"],
    credentials: true,
}));
app.use("/api/auth/{*any}", toNodeHandler(auth));
app.use(express.json());
app.get("/api/health", (req, res) => {
    res.status(200).json({ status: "OK" });
});
app.use("/api/v1/users", userRouter);
app.use("/api/v1/", requireAuth, loadPermissions, indexRouter);
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
