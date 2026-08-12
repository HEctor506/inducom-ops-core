const HUBSPOT_API_BASE = "https://api.hubapi.com";

/**
 * =========================
 * CLIENTE BASE HUBSPOT
 * =========================
 */

const hubspotRequest = async (path, options = {}) => {
  const accessToken = process.env.PRIVATE_APP_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error("Missing PRIVATE_APP_ACCESS_TOKEN secret.");
  }

  const response = await fetch(`${HUBSPOT_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();

  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch (e) {
    data = { raw: text };
  }

  if (!response.ok) {
    const error = new Error(`HubSpot API error ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
};

module.exports = {
  hubspotRequest,
};