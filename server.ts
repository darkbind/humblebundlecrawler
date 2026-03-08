import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Proxy for Humble Bundle
  app.post("/api/humble/orders", async (req, res) => {
    const { cookie } = req.body;
    if (!cookie) {
      return res.status(400).json({ error: "Cookie is required" });
    }

    try {
      const response = await fetch("https://www.humblebundle.com/api/v1/user/order", {
        headers: {
          "Cookie": `_simpleauth_sess=${cookie}`,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({ error: "Humble Bundle API error", details: errorText });
      }

      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/humble/order-details", async (req, res) => {
    const { cookie, gamekey } = req.body;
    if (!cookie || !gamekey) {
      return res.status(400).json({ error: "Cookie and gamekey are required" });
    }

    try {
      const response = await fetch(`https://www.humblebundle.com/api/v1/order/${gamekey}?all_tpkds=true`, {
        headers: {
          "Cookie": `_simpleauth_sess=${cookie}`,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
      });

      if (!response.ok) {
        return res.status(response.status).json({ error: "Humble Bundle API error" });
      }

      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
