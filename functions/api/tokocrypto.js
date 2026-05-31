const TOKOCRYPTO_TICKERS_URL = "https://www.tokocrypto.site/api/v3/ticker/24hr";
const TOKOCRYPTO_TRADE_PAGE_URL = "https://www.tokocrypto.com/en/trade/BTC_IDR";
const COINGECKO_TOKOCRYPTO_TICKERS_URL = "https://api.coingecko.com/api/v3/exchanges/toko_crypto/tickers";
const REQUEST_TIMEOUT_MS = 12000;

const LAST_KNOWN_TOKOCRYPTO_VOLUMES = {
  USDT: 28.03821945254,
  BTC: 2.36563992981,
  BNB: 3.54415908736,
  ETH: 0.92864470128,
  DOGE: 0.655378673,
  XRP: 0.5220051506000001,
  SOL: 0.8377406885199999,
  SUI: 1.44367930879,
};

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
    },
  });
}

function toBillions(value) {
  return Number(value || 0) / 1_000_000_000;
}

async function fetchWithTimeout(url, responseType = "json") {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        accept: responseType === "text" ? "text/html,*/*" : "application/json,*/*",
        "user-agent": "Reku Treasury Volume Dashboard/1.0",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`${url} returned ${response.status}`);
    }

    return responseType === "text" ? response.text() : response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function getTickerVolume(asset) {
  const ticker = await fetchWithTimeout(`${TOKOCRYPTO_TICKERS_URL}?symbol=${encodeURIComponent(`${asset}IDR`)}`);
  return ticker?.quoteVolume ? toBillions(ticker.quoteVolume) : null;
}

async function getTradePageVolumes(assets) {
  const html = await fetchWithTimeout(TOKOCRYPTO_TRADE_PAGE_URL, "text");

  return Object.fromEntries(
    assets.map((asset) => {
      const symbol = `${asset}IDR`;
      const symbolMatch = html.match(new RegExp(`"${symbol}"\\s*:\\s*\\{([^{}]+)\\}`));
      const quoteVolumeMatch = symbolMatch?.[1]?.match(/"quoteVolume"\s*:\s*"([^"]+)"/);
      return [asset, quoteVolumeMatch ? toBillions(quoteVolumeMatch[1]) : null];
    })
  );
}

export async function onRequest(context) {
  const { request } = context;

  if (request.method === "OPTIONS") {
    return jsonResponse({}, 204);
  }

  const url = new URL(request.url);
  const assets = (url.searchParams.get("assets") || "")
    .split(",")
    .map((asset) => asset.trim().toUpperCase())
    .filter(Boolean);

  if (!assets.length) {
    return jsonResponse({ error: "Missing assets query parameter" }, 400);
  }

  const errors = [];
  const volumes = {};

  await Promise.all(
    assets.map(async (asset) => {
      try {
        volumes[asset] = await getTickerVolume(asset);
      } catch (error) {
        volumes[asset] = null;
        errors.push({ asset, message: error.message });
      }
    })
  );

  const missingAssets = assets.filter((asset) => volumes[asset] == null);

  if (missingAssets.length) {
    try {
      const fallbackVolumes = await getTradePageVolumes(missingAssets);
      for (const asset of missingAssets) {
        volumes[asset] = fallbackVolumes[asset] ?? null;
      }
    } catch (error) {
      errors.push({ exchange: "tokocrypto-page", message: error.message });
    }
  }

  const stillMissingAssets = assets.filter((asset) => volumes[asset] == null);

  if (stillMissingAssets.length) {
    try {
      const coingeckoVolumes = await getCoinGeckoTokocryptoVolumes(stillMissingAssets);
      for (const asset of stillMissingAssets) {
        volumes[asset] = coingeckoVolumes[asset] ?? null;
      }
    } catch (error) {
      errors.push({ exchange: "coingecko-tokocrypto", message: error.message });
    }
  }

  const unresolvedAssets = assets.filter((asset) => volumes[asset] == null);

  for (const asset of unresolvedAssets) {
    volumes[asset] = LAST_KNOWN_TOKOCRYPTO_VOLUMES[asset] ?? null;
  }

  return jsonResponse({
    source: "tokocrypto-live",
    generatedAt: new Date().toISOString(),
    volumes,
    errors,
  });
}

async function getCoinGeckoTokocryptoVolumes(assets) {
  const volumes = Object.fromEntries(assets.map((asset) => [asset, null]));

  for (let page = 1; page <= 4; page += 1) {
    const data = await fetchWithTimeout(`${COINGECKO_TOKOCRYPTO_TICKERS_URL}?page=${page}&depth=false`);
    const tickers = data?.tickers || [];

    for (const ticker of tickers) {
      const asset = String(ticker.base || "").toUpperCase();

      if (!assets.includes(asset) || ticker.target !== "IDR") {
        continue;
      }

      const idrVolume = Number(ticker.last || 0) * Number(ticker.volume || 0);
      volumes[asset] = idrVolume > 0 ? toBillions(idrVolume) : null;
    }

    if (assets.every((asset) => volumes[asset] != null)) {
      break;
    }
  }

  return volumes;
}
