import { Router } from "express";
import {
  analyzeScreen,
  askQuestion,
  getHealth,
  handleCommand,
} from "../controllers/assistantController.js";

const router = Router();

router.get("/", (_req, res) => {
  res.status(200).json({
    ok: true,
    route: "/",
    state: "completed",
    provider: "none",
    mode: "text",
    reply: "DevVoice OS backend is running.",
    audioUrl: null,
    meta: {},
  });
});

router.get("/health", getHealth);
router.post("/ask", askQuestion);
router.post("/command", handleCommand);
router.post("/analyze-screen", analyzeScreen);

export default router;
