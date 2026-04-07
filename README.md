# 🤖 Bazaar Bot — Market-Aware Negotiation Assistant

> Know the real market price before you buy or sell — and negotiate like a pro.

Bazaar Bot is a full-stack Node.js web app that helps buyers and vendors negotiate smarter at any Indian bazaar or marketplace. Enter a product and a price, and the bot instantly tells you if the deal is fair, overpriced, or a steal — and hands you a ready-to-use negotiation script. For vegetables, fruits, and packaged groceries, it fetches **real live market prices** from Indian government and open-source APIs.

---

## ✨ Features

- **679-product Indian market database** — vegetables, fruits, electronics, groceries, fashion, appliances, stationary, and more
- **Live price fetching** from free, real APIs:
  - 🥦 Agmarknet (data.gov.in) — official government mandi prices for vegetables & fruits
  - 🛒 Open Food Facts — open-source packaged food price data
  - 🔄 Automatic fallback to local JSON cache if APIs are unavailable
- **Negotiation strategy engine** — generates a verdict (Overpriced / Fair / Underselling), step-by-step tactics, and a copy-paste script tailored for both buyers and vendors
- **12-month price history chart** — powered by Chart.js
- **Fuzzy product matching** — exact → prefix → word-overlap → category fallback
- **Rate limiting** — 150 requests per 15 minutes per IP via `express-rate-limit`
- **Autocomplete search** with category emoji labels
- **Fully responsive** dark-green UI — works on mobile and desktop

---

## 🏗️ Architecture

```
Browser (Vanilla JS + Chart.js)
        │
        ▼
    server.js  (Express)
        │
        ├──► POST /api/analyze  ──► findProduct() + getLivePrice() + buildNegotiation()
        │                                                │
        │                                    services/priceService.js
        │                                         │           │
        │                              [live cache 10min]      │
        │                                         │           │
        │                                  data/price/api.js  │
        │                               ┌──────────┴──────────┐
        │                         Agmarknet API        Open Food Facts
        │                         (data.gov.in)        (no key needed)
        │                         veg / fruits          groceries
        │
        ├──► GET /api/products   ──► autocomplete from products.js
        │
        └──► GET /price/:id      ──► DummyJSON API → priceStore.json fallback
                                      (legacy demo route)
```

**Layer separation — strict:**

| Layer | File | Responsibility |
|---|---|---|
| Route / Controller | `server.js`, `routes/priceRoutes.js` | HTTP only — parse request, call service, send response |
| Service | `services/priceService.js` | All decisions — cache, routing, fallback logic |
| Data / API | `data/price/api.js` | External API calls only — Agmarknet, Open Food Facts, DummyJSON |
| Data / Local | `data/price/local.js` | JSON file read/write — sliding window history |

---

## 📁 Project Structure

```
bazaar-bot/
├── server.js                    # Express entry point, all main routes
├── package.json
├── .env                         # Your API key (git-ignored)
├── .env.example                 # Template — copy to .env
│
├── routes/
│   └── priceRoutes.js           # GET /price/:productId (DummyJSON legacy route)
│
├── services/
│   └── priceService.js          # Business logic: live price + fallback chain
│
├── data/
│   ├── products.js              # 679-product static Indian market database
│   └── price/
│       ├── api.js               # Agmarknet + Open Food Facts + DummyJSON calls
│       ├── local.js             # priceStore.json read/write + sliding window
│       └── priceStore.json      # Auto-managed local cache (do not edit manually)
│
└── public/
    ├── index.html               # Single-page frontend
    ├── script.js                # Frontend logic + Chart.js rendering
    └── style.css                # Dark-green theme
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js v18 or higher
- npm

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/your-username/bazaar-bot.git
cd bazaar-bot

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# The demo API key in .env works immediately.
# Replace it with your own free key for higher rate limits (see below).

# 4. Start the server
npm start
```

Open **http://localhost:3000** in your browser.

### Development mode (auto-reload)

```bash
npm run dev
```

---

## 🔑 API Keys

### data.gov.in (Agmarknet) — for live vegetable & fruit mandi prices

A free demo API key ships inside `.env.example` and works immediately. For production or heavier use, get your own key in under 2 minutes:

1. Go to **https://data.gov.in/user/register**
2. Register with your email — no payment required
3. Your key appears on your profile page
4. Paste it into `.env`:

```env
DATAGOVIN_API_KEY=your_key_here
```

### Open Food Facts — no key needed

Completely free and open. No registration required.

---

## 🌐 API Reference

### `POST /api/analyze`

Analyze a product price and get a full negotiation strategy.

**Request body:**
```json
{
  "product": "tomato",
  "userPrice": 60
}
```

**Response:**
```json
{
  "success": true,
  "matchedProduct": "Tomato",
  "matchType": "exact",
  "category": "vegetables",
  "marketPrice": 42,
  "minMarket": 37,
  "maxMarket": 47,
  "sweetSpot": 44,
  "userPrice": 60,
  "priceHistory": [{ "label": "May '24", "price": 38 }, "..."],
  "strategy": {
    "verdict": "⚠️ Price Too High",
    "action": "You're asking 42.9% above market rate",
    "tip": "Customers might walk away. Try targeting ₹44",
    "steps": ["..."]
  },
  "script": "\"I understand you're looking for a low price...\"",
  "livePrice": {
    "price": 42,
    "source": "agmarknet",
    "currency": "INR",
    "commodity": "Tomato",
    "marketsQueried": 18,
    "rawPricePerQuintal": 4200,
    "fetchedAt": "2026-04-07T10:30:00.000Z"
  }
}
```

The `livePrice` field is present when a real API price was fetched. It is `null` for categories with no free live source (electronics, fashion, etc.), which fall back to the static database.

---

### `GET /api/products?q=`

Autocomplete — returns up to 8 matching products.

```
GET /api/products?q=tom
```

```json
[
  { "name": "Tomato", "key": "tomato", "category": "vegetables", "price": 40 },
  "..."
]
```

---

### `GET /price/:productId`

Legacy route — fetches a product by DummyJSON ID (1–100) with local cache fallback. Powers the Live Price Tracker widget.

```
GET /price/1
```

```json
{
  "source": "api",
  "isFallback": false,
  "productId": 1,
  "currentPrice": 549.99,
  "history": [{ "price": 542.5, "time": 1712345678000 }],
  "lastUpdated": 1712346000000
}
```

---

## 📊 Live Price Data Sources

| Category | API | Key Required | Price Type |
|---|---|---|---|
| Vegetables | Agmarknet (data.gov.in) | ✅ Free (get at data.gov.in) | Real mandi modal price ₹/kg |
| Fruits | Agmarknet (data.gov.in) | ✅ Free (get at data.gov.in) | Real mandi modal price ₹/kg |
| Groceries | Open Food Facts | ❌ None needed | India-tagged product prices |
| Electronics | Static database | — | Curated Indian retail prices |
| Basic Electronics | Static database | — | Curated Indian retail prices |
| Stationary | Static database | — | Curated local vendor prices |
| Fashion | Static database | — | Curated Indian retail prices |
| Appliances | Static database | — | Curated Indian retail prices |

**Live price caching:** Agmarknet and Open Food Facts responses are cached in memory for 10 minutes to respect free API rate limits. DummyJSON responses cache for 30 seconds with persistent JSON fallback.

---

## 🛡️ Fault Tolerance

The system is designed to **never crash and always return usable data.**

| Failure Scenario | What Happens |
|---|---|
| Agmarknet API is down | Falls back to static `products.js` price silently |
| API response exceeds 5s timeout | `AbortController` kills the request, static fallback used |
| Open Food Facts returns no India price | Returns `null`, static price used — no error shown |
| `priceStore.json` is corrupted | Resets to `{}` safely, no crash |
| DummyJSON down + no local cache | Returns HTTP 503 with a descriptive error message |
| Any unhandled error in a route | Caught at route level, server keeps running |
| Rate limit exceeded (150 req/15 min) | Returns HTTP 429 with a JSON error message |

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js ≥ 18 |
| Framework | Express.js 4.x |
| Frontend | Vanilla JS (ES2020+) |
| Charts | Chart.js 4.4 |
| Rate Limiting | express-rate-limit |
| Environment | dotenv |
| Live Mandi Prices | Agmarknet via data.gov.in |
| Live Grocery Prices | Open Food Facts |
| Dev Tooling | Nodemon |

---

## 🌱 Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the server listens on |
| `DATAGOVIN_API_KEY` | Demo key | Free key from data.gov.in for Agmarknet mandi prices |

---

## 📦 Product Database

679 products across 9 categories with realistic Indian market prices:

| Category | Count | Examples |
|---|---|---|
| 🔌 Basic Electronics | 127 | Earphones, chargers, cables, power banks, bulbs, trimmers |
| ✏️ Stationary | 99 | Pens, notebooks, geometry boxes, art supplies, files |
| 📱 Electronics | 93 | Smartphones, laptops, TVs, cameras, gaming consoles |
| 🏠 Appliances | 73 | AC, fridge, washing machine, mixer, geyser |
| 🛒 Groceries | 72 | Dal, oil, biscuits, soap, shampoo, masala |
| 📦 Misc | 60 | Books, sports, furniture, accessories |
| 👗 Fashion | 56 | Jeans, kurtas, shoes, sarees, watches |
| 🍎 Fruits | 50 | Mango, apple, banana, grapes, dry fruits |
| 🥦 Vegetables | 49 | Tomato, potato, onion, capsicum, brinjal |

---

## 📝 .gitignore

```gitignore
node_modules/
.env
data/price/priceStore.json
*.log
```

> `priceStore.json` auto-grows at runtime. Commit the blank `{}` placeholder but add the live file to `.gitignore`.

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit: `git commit -m 'Add your feature'`
4. Push and open a Pull Request

---

## 📄 License

MIT — see [LICENSE](LICENSE) for details.

---

> Made with ❤️ for smarter bazaar bargaining · **Bazaar Bot v1.0**
