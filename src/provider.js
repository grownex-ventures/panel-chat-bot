import { config } from "./config.js";

export async function providerApi(apiKey, action, params = {}, timeoutMs = 15000) {
  const body = new URLSearchParams({ key: apiKey.trim(), action, ...params });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(config.providerBaseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Provider HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    return data;
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`Provider request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function verifyApiKey(apiKey) {
  try {
    const data = await providerApi(apiKey, "balance");
    if (data.error || data.balance === undefined) {
      return { ok: false, error: data.error || "Invalid API key" };
    }
    return { ok: true, balance: data.balance, currency: data.currency || "INR" };
  } catch (err) {
    return { ok: false, error: err.message || "Failed to reach provider" };
  }
}

export async function getBalance(apiKey) {
  return providerApi(apiKey, "balance");
}

export async function getServices(apiKey) {
  return providerApi(apiKey, "services");
}

export async function getOrderStatus(apiKey, orderId) {
  return providerApi(apiKey, "status", { order: orderId });
}

export async function getMultipleOrdersStatus(apiKey, orderIds) {
  const ids = Array.isArray(orderIds) ? orderIds.join(",") : String(orderIds);
  return providerApi(apiKey, "status", { orders: ids });
}

export async function placeOrder(apiKey, { service, link, quantity, runs, interval }) {
  const params = { service, link, quantity };
  if (runs) params.runs = runs;
  if (interval) params.interval = interval;
  return providerApi(apiKey, "add", params);
}

export async function requestRefill(apiKey, orderId) {
  return providerApi(apiKey, "refill", { order: orderId });
}

export async function getRefillStatus(apiKey, refillId) {
  return providerApi(apiKey, "refill_status", { refill: refillId });
}

export async function cancelOrders(apiKey, orderIds) {
  const ids = Array.isArray(orderIds) ? orderIds.join(",") : String(orderIds);
  return providerApi(apiKey, "cancel", { orders: ids });
}
