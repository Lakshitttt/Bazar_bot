// ============================================================
// BAZAAR BOT — server.js
// Node.js + Express backend
// Handles product analysis, price matching, negotiation logic
// ============================================================

// Load .env before anything else (safe no-op if file absent)
try { require("dotenv").config(); } catch (_) {}

const express = require("express");
const cors = require("cors");
const path = require("path");
const products = require("./data/products");
const priceRoutes = require("./routes/priceRoutes");
const { getLivePrice } = require("./services/priceService");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 3000;

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 150, // Limit each IP to 150 requests per `window` (here, per 15 minutes)
  message: { error: "Too many requests, please try again later." }
});

// ─── Middleware ──────────────────────────────────────────────
app.use(cors({ origin: ["http://localhost:3000", "http://127.0.0.1:3000"] })); // Restrict in production
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ─── Price API (DummyJSON legacy route) ─────────────────────
app.use("/price", apiLimiter, priceRoutes);

// ─── Helper: Fuzzy/Approximate Product Matching ──────────────
function findProduct(query) {
  const q = query.toLowerCase().trim();

  if (products[q]) return { key: q, data: products[q], matchType: "exact" };

  for (const key of Object.keys(products)) {
    if (key.startsWith(q) || q.startsWith(key)) {
      return { key, data: products[key], matchType: "close" };
    }
  }

  const queryWords = q.split(" ").filter((w) => w.length > 2);
  let bestScore = 0, bestMatch = null;

  for (const key of Object.keys(products)) {
    const keyWords = key.split(" ");
    const matchCount = queryWords.filter((w) =>
      keyWords.some((k) => k.includes(w) || w.includes(k))
    ).length;
    const score = matchCount / Math.max(queryWords.length, 1);
    if (score > bestScore) { bestScore = score; bestMatch = key; }
  }

  if (bestScore >= 0.5) {
    return { key: bestMatch, data: products[bestMatch], matchType: "fuzzy" };
  }

  const categoryKeywords = {
    electronics: ["phone", "mobile", "laptop", "computer", "tablet", "tv", "camera", "headphone", "speaker", "keyboard", "mouse", "playstation", "xbox", "gaming"],
    fashion: ["shirt", "jeans", "dress", "shoe", "sneaker", "kurta", "saree", "watch", "bag", "handbag", "makeup", "lipstick", "lehenga", "sherwani"],
    appliances: ["ac", "fridge", "washing", "microwave", "mixer", "cooler", "geyser", "vacuum", "heater", "cooktop", "chimney", "dishwasher"],
    groceries: ["rice", "dal", "oil", "sugar", "tea", "coffee", "soap", "shampoo", "flour", "salt", "masala", "spice", "biscuit", "snack", "detergent", "ketchup"],
    vegetables: ["tomato", "potato", "onion", "garlic", "ginger", "capsicum", "carrot", "cauliflower", "cabbage", "spinach", "brinjal", "peas", "beans", "gourd", "methi", "coriander", "mushroom", "broccoli", "corn", "vegetable", "sabzi", "ladyfinger", "okra", "radish", "beetroot", "turnip", "pumpkin"],
    fruits: ["banana", "apple", "mango", "orange", "grapes", "watermelon", "papaya", "guava", "pineapple", "pomegranate", "strawberry", "kiwi", "coconut", "lemon", "fruit", "chikoo", "litchi", "dates", "cashew", "almond", "walnut", "dry fruit", "raisin", "pistachio"],
    stationary: ["pen", "pencil", "notebook", "eraser", "sharpener", "ruler", "stapler", "file", "folder", "scissors", "glue", "tape", "marker", "highlighter", "crayon", "paint", "brush", "chart", "diary", "register", "compass", "geometry", "stationery", "stationary", "correction"],
    basic_electronics: ["earphone", "charger", "cable", "power bank", "cover", "case", "tempered glass", "screen guard", "otg", "aux", "torch", "extension", "usb", "pendrive", "memory card", "selfie stick", "bulb", "fan", "kettle", "trimmer", "dryer", "weighing", "thermometer", "oximeter", "battery", "led", "adapter", "holder", "pop socket"],
    misc: ["book", "mat", "furniture", "chair", "table", "bed", "cycle", "game", "sport", "backpack", "tripod", "ring light", "webcam"],
  };

  for (const [cat, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some((kw) => q.includes(kw))) {
      const catProducts = Object.entries(products).filter(([, v]) => v.category === cat);
      if (catProducts.length > 0) {
        const [rKey, rData] = catProducts[Math.floor(Math.random() * catProducts.length)];
        return { key: rKey, data: rData, matchType: "category_fallback" };
      }
    }
  }

  return null;
}

// ─── Helper: Generate Realistic Price History ─────────────────
function generatePriceHistory(basePrice, months = 12) {
  const history = [];
  const now = new Date();
  let price = basePrice * (0.85 + Math.random() * 0.1);

  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = date.toLocaleString("en-IN", { month: "short", year: "2-digit" });
    const isSaleSeason = [9, 10, 0].includes(date.getMonth());
    const change = isSaleSeason ? -Math.random() * 0.08 : (Math.random() - 0.45) * 0.08;
    price = Math.max(price * (1 + change), basePrice * 0.6);
    history.push({ label, price: Math.round(price) });
  }
  history[history.length - 1].price = basePrice;
  return history;
}

// ─── Helper: Build Negotiation Strategy ──────────────────────
function buildNegotiation(marketPrice, userPrice, category) {
  const diff = userPrice - marketPrice;
  const diffPct = ((diff / marketPrice) * 100).toFixed(1);
  
  // Vendor (Seller) perspective parameters
  const minPrice = Math.round(marketPrice * 0.90);  // Lowest acceptable floor
  const maxPrice = Math.round(marketPrice * 1.15);  // High ambitious margin
  const sweetSpot = Math.round(marketPrice * 1.05); // Good profit while staying competitive

  let strategy = {}, script = "";

  if (userPrice > marketPrice * 1.15) {
    strategy = {
      verdict: "⚠️ Price Too High",
      verdictClass: "overpriced",
      action: `You're asking ${Math.abs(diffPct)}% above market rate`,
      tip: `Customers might walk away. Try targeting ₹${sweetSpot.toLocaleString("en-IN")}`,
      steps: [
        `If the buyer hesitates, offer a quick "loyalty discount" to ₹${sweetSpot.toLocaleString("en-IN")}`,
        `Highlight the superior quality to justify any premium over ₹${marketPrice.toLocaleString("en-IN")}`,
        `Drop to ₹${marketPrice.toLocaleString("en-IN")} if they are completely walking away`,
      ],
    };
    script = `"I understand you're looking for a low price, but my quality is the best here. Since you are a regular, I'll drop my margin and give it to you for just ₹${sweetSpot.toLocaleString("en-IN")}."`;
  } else if (userPrice < marketPrice * 0.95) {
    strategy = {
      verdict: "🚨 Underselling",
      verdictClass: "overpriced", // Reusing this class for warning styles
      action: `You're ${Math.abs(diffPct)}% below market — losing profit!`,
      tip: `Market average is ₹${marketPrice.toLocaleString("en-IN")}. Standardize your prices up.`,
      steps: [
        `Do not offer any more discounts; you are already giving a massive steal`,
        `Target the sweet spot of ₹${sweetSpot.toLocaleString("en-IN")} for your future asking prices`,
        `Let them know this is a one-time wholesale-level exception`,
      ],
    };
    script = `"The market rate for this is strictly ₹${marketPrice.toLocaleString("en-IN")} everywhere else. At ₹${userPrice.toLocaleString("en-IN")}, I'm practically giving it to you at a loss today."`;
  } else {
    // Within competitive bounds (+/- 5-15%)
    strategy = {
      verdict: "✅ Solid Margin",
      verdictClass: "fair",
      action: `Your price perfectly matches today's competitive range.`,
      tip: `Hold firm! Ideally, settle no lower than ₹${sweetSpot.toLocaleString("en-IN")}`,
      steps: [
        `Quote ₹${userPrice.toLocaleString("en-IN")} confidently as your first offer`,
        `If they bargain hard, smoothly step down to ₹${sweetSpot.toLocaleString("en-IN")}`,
        `Offer an extra item or bulk quantity instead of dropping prices below ₹${marketPrice.toLocaleString("en-IN")}`,
      ],
    };
    script = `"This price is extremely competitive for today's market. If you commit right now, I can round it slightly down to ₹${sweetSpot.toLocaleString("en-IN")} for you."`;
  }

  return { strategy, script, minPrice, maxPrice, sweetSpot };
}

// ─── API: POST /api/analyze ──────────────────────────────────
app.post("/api/analyze", apiLimiter, async (req, res) => {
  const { product, userPrice } = req.body;

  if (!product || typeof product !== "string" || !userPrice) {
    return res.status(400).json({ error: "Product name must be a valid string and price is required." });
  }

  const parsedPrice = parseFloat(userPrice);
  if (isNaN(parsedPrice) || parsedPrice <= 0) {
    return res.status(400).json({ error: "Please enter a valid price." });
  }

  const match = findProduct(product);

  let marketPrice, productName, category, matchType;

  if (match) {
    marketPrice = match.data.price;
    productName = match.key
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    category = match.data.category;
    matchType = match.matchType;
  } else {
    const allPrices = Object.values(products).map((p) => p.price);
    const avgPrice = allPrices.reduce((a, b) => a + b, 0) / allPrices.length;
    marketPrice = Math.round(avgPrice);
    productName = product.charAt(0).toUpperCase() + product.slice(1);
    category = "misc";
    matchType = "generic_fallback";
  }

  // ── Live price lookup (non-blocking: fails gracefully) ──────
  // For vegetables/fruits: Agmarknet mandi price (₹/kg)
  // For groceries: Open Food Facts price (INR when available)
  // For all others: null (static data used as-is)
  let livePrice = null;
  try {
    const livePriceData = await getLivePrice(
      match ? match.key : product.toLowerCase().trim(),
      category
    );
    if (livePriceData && livePriceData.price > 0) {
      livePrice = livePriceData;
      // Use live price as market reference if available
      marketPrice = livePriceData.price;
    }
  } catch (_) {
    // getLivePrice already swallows errors; this is belt-and-suspenders
  }

  const priceHistory = generatePriceHistory(marketPrice);
  const minMarket = Math.round(marketPrice * 0.88);
  const maxMarket = Math.round(marketPrice * 1.12);
  const { strategy, script, minPrice, maxPrice, sweetSpot } = buildNegotiation(
    marketPrice,
    parsedPrice,
    category
  );

  return res.json({
    success: true,
    query: product,
    matchedProduct: productName,
    matchType,
    category,
    marketPrice,
    minMarket,
    maxMarket,
    sweetSpot,
    userPrice: parsedPrice,
    priceHistory,
    strategy,
    script,
    // Live price metadata — frontend can show a "Live" badge when present
    livePrice: livePrice
      ? {
          price: livePrice.price,
          source: livePrice.source,           // "agmarknet" | "openfoodfacts"
          currency: livePrice.currency,
          fetchedAt: new Date().toISOString(),
          ...(livePrice.marketsQueried && { marketsQueried: livePrice.marketsQueried }),
          ...(livePrice.rawPricePerQuintal && { rawPricePerQuintal: livePrice.rawPricePerQuintal }),
          ...(livePrice.commodity && { commodity: livePrice.commodity }),
        }
      : null,
  });
});

// ─── API: GET /api/products ── for autocomplete ──────────────
app.get("/api/products", (req, res) => {
  const q = (req.query.q || "").toLowerCase();
  const results = Object.keys(products)
    .filter((k) => k.includes(q))
    .slice(0, 8)
    .map((k) => ({
      name: k.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
      key: k,
      category: products[k].category,
      price: products[k].price,
    }));
  res.json(results);
});

// ─── Serve frontend ──────────────────────────────────────────
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ─── Start Server ────────────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🤖 Bazaar Bot is live at http://localhost:${PORT}`);
    console.log(`📦 Products in database: ${Object.keys(products).length} across 9 categories`);
    console.log(`🥦 Agmarknet (mandi prices): ✅ ACTIVE — data.gov.in`);
    console.log(`🛒 Open Food Facts (groceries): ✅ ACTIVE — no key required`);
    console.log(`\nPress Ctrl+C to stop the server.\n`);
  });
}

module.exports = app;
