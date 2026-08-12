/**
 * =========================
 * CLIENTE BASE HUBSPOT
 * =========================
 *
 * NOTA: Las serverless functions de HubSpot no pueden importar archivos
 * locales hermanos (require("./hubspot-client") falla en runtime con
 * "Cannot find module"). Todo el código debe vivir en este archivo.
 */

const HUBSPOT_API_BASE = "https://api.hubapi.com";

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

/**
 * =========================
 * CONFIG GENERAL
 * =========================
 */

const OBJECT_TYPE = {
  CONTACT: "0-1",
  COMPANY: "0-2",
  DEAL: "0-3",
  QUOTE: "0-14",
};

const API_OBJECT_PATH = {
  contact: "contacts",
  company: "companies",
  deal: "deals",
  quote: "quotes",
};

/**
 * =========================
 * CONFIG LÓGICA 2: ASIGNACION FALLBACK LINK TO DEAL
 * =========================
 */

const DEAL_PAID_LINK_PAYPAL_PROPERTY = "paid_link_paypal";
const LINK_FALLBACK_PAYPAL_DEAL  = "https://www.grupo-inducom.com/pago-en-paypal/";


/**
 * =========================
 * CONFIG LÓGICA 1: QUOTE STATUS CHANGE
 * =========================
 */

const QUOTE_STATUS_PROPERTY = "hs_status";

const QUOTE_PROPERTIES = [
  "hs_title",
  "hs_expiration_date",
  "hs_status",
  "hs_last_published_date",
  "hs_public_url_key",
  "hs_pdf_download_link",
  "hs_quote_number",
  "hs_quote_link",
  "hs_slug",
];

const DEAL_QUOTE_URL_PROPERTY = "url_cotizacion";
const DEAL_ID_NEGOCIO_PROPERTY = "id_negocio";



/**
 * =========================
 * CONFIG LÓGICA 3: QUOTE STATUS CHANGE
 * =========================
 */

// const QUOTE_STATUS_PROPERTY = "hs_status";

// const QUOTE_PROPERTIES = [
//   "hs_title",
//   "hs_expiration_date",
//   "hs_status",
//   "hs_last_published_date",
//   "hs_public_url_key",
//   "hs_pdf_download_link",
//   "hs_quote_number",
//   "hs_quote_link",
//   "hs_slug",
// ];

// const DEAL_QUOTE_URL_PROPERTY = "url_cotizacion";
// const DEAL_ID_NEGOCIO_PROPERTY = "id_negocio";


/**
 * =========================
 * HELPERS GENERALES
 * =========================
 */

const parseBody = (body) => {
  if (!body) return [];

  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
      return [];
    }
  }

  return Array.isArray(body) ? body : [body];
};

const getObjectId = (event) => {
  if (event?.objectId || event?.objectId === 0) {
    return String(event.objectId);
  }

  return null;
};

const getEventSubscriptionType = (event) => {
  return String(event?.subscriptionType || event?.eventType || "");
};

const getEventPropertyName = (event) => {
  return String(event?.propertyName || event?.property || "");
};

const getEventObjectType = (event) => {
  const rawType = String(
    event?.objectType ||
      event?.objectTypeId ||
      event?.objectTypeID ||
      event?.objectTypeName ||
      event?.objectTypeLabel ||
      ""
  ).toLowerCase();

  if (
    rawType === "deal" ||
    rawType === "deals" ||
    rawType === OBJECT_TYPE.DEAL ||
    rawType.includes("deal")
  ) {
    return "deal";
  }

  if (
    rawType === "company" ||
    rawType === "companies" ||
    rawType === OBJECT_TYPE.COMPANY ||
    rawType.includes("company")
  ) {
    return "company";
  }

  if (
    rawType === "contact" ||
    rawType === "contacts" ||
    rawType === OBJECT_TYPE.CONTACT ||
    rawType.includes("contact")
  ) {
    return "contact";
  }

  if (
    rawType === "quote" ||
    rawType === "quotes" ||
    rawType === OBJECT_TYPE.QUOTE ||
    rawType.includes("quote")
  ) {
    return "quote";
  }

  return "unknown";
};

const escapeJsonString = (value) => {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
};

const cleanText = (value) => {
  return String(value || "").trim();
};

const jsonResponse = (statusCode, body) => {
  return {
    statusCode,
    body,
    headers: {
      "Content-Type": "application/json",
    },
  };
};

/**
 * =========================
 * LÓGICA 1: QUOTE STATUS CHANGE
 * =========================
 *
 * Objetivo:
 * Cuando cambia quote.hs_status:
 * 1. Consultar la cotización.
 * 2. Si está en DRAFT, no hacer nada.
 * 3. Si no está en DRAFT, buscar el negocio asociado.
 * 4. Consultar el deal.
 * 5. Si el dealname ya contiene el hs_quote_number, no actualizar.
 * 6. Si no lo contiene, actualizar:
 *    - url_cotizacion
 *    - id_negocio
 *    - dealname
 */

const getQuoteForStatusChange = async (quoteId) => {
  return await hubspotRequest(
    `/crm/v3/objects/quotes/${quoteId}?properties=${QUOTE_PROPERTIES.join(
      ","
    )}&archived=false`,
    { method: "GET" }
  );
};

const getQuoteAssociatedDeals = async (quoteId) => {
  return await hubspotRequest(
    `/crm/v3/objects/quotes/${quoteId}/associations/deals`,
    { method: "GET" }
  );
};

const getDealForQuoteStatusChange = async (dealId) => {
  return await hubspotRequest(
    `/crm/v3/objects/deals/${dealId}?properties=dealname&archived=false`,
    { method: "GET" }
  );
};

const updateDealFromQuote = async ({
  dealId,
  quoteLink,
  quoteNumber,
  newDealname,
}) => {
  return await hubspotRequest(`/crm/v3/objects/deals/${dealId}`, {
    method: "PATCH",
    body: `{
      "properties": {
        "${DEAL_QUOTE_URL_PROPERTY}": "${escapeJsonString(quoteLink)}",
        "${DEAL_ID_NEGOCIO_PROPERTY}": "EC${escapeJsonString(quoteNumber)}",
        "dealname": "${escapeJsonString(newDealname)}"
      }
    }`,
  });
};

const buildDealNameFromQuote = ({ currentDealname, quoteNumber }) => {
  const cleanDealname = cleanText(currentDealname)
    .replace(/- \d+$/, "")
    .replace(/['"]/g, "")
    .trim();

  const cleanQuoteNumber = cleanText(quoteNumber)
    .replace(/['"]/g, "")
    .trim();

  return `${cleanDealname} ${cleanQuoteNumber}`.trim();
};

const processQuoteStatusChange = async (quoteId) => {
  const result = {
    module: "logic_1_quote_status_change",
    quoteId,
    status: "pending",
    quoteStatus: null,
    quoteNumber: null,
    quoteLink: null,
    dealId: null,
    previousDealname: null,
    newDealname: null,
    action: null,
  };

  const quote = await getQuoteForStatusChange(quoteId);

  const quoteStatus = quote?.properties?.hs_status || null;
  const quoteNumber = quote?.properties?.hs_quote_number || null;
  const quoteLink = quote?.properties?.hs_quote_link || null;

  result.quoteStatus = quoteStatus;
  result.quoteNumber = quoteNumber;
  result.quoteLink = quoteLink;

  if (!quoteStatus) {
    result.status = "skipped_no_quote_status";
    result.action = "no_change";
    return result;
  }

  //? Si la cotización está en DRAFT, no hacer nada.
  if (String(quoteStatus) === "DRAFT") {
    result.status = "skipped_quote_is_draft";
    result.action = "no_change";
    return result;
  }

  if (!quoteNumber) {
    result.status = "skipped_no_quote_number";
    result.action = "no_change";
    return result;
  }

  //? Get the associated deal for the quote.
  const associations = await getQuoteAssociatedDeals(quoteId);

  const dealId = associations?.results?.[0]?.id
    ? String(associations.results[0].id)
    : null;

  result.dealId = dealId;

  //? Si no hay un negocio asociado, no hacer nada.
  if (!dealId) {
    result.status = "skipped_no_associated_deal";
    result.action = "no_change";
    return result;
  }

  //? Consultar datos del negocio.
  const deal = await getDealForQuoteStatusChange(dealId);
  const currentDealname = deal?.properties?.dealname || "";

  //? Guardar el dealname previo para referencia.
  result.previousDealname = currentDealname;

  //? Si el dealname ya contiene el quoteNumber, no hacer nada.
  if (String(currentDealname).includes(String(quoteNumber))) {
    result.status = "skipped_dealname_already_contains_quote_number";
    result.action = "no_change";
    return result;
  }

  //? Construir el nuevo dealname a partir del quoteNumber.
  const newDealname = buildDealNameFromQuote({
    currentDealname,
    quoteNumber,
  });

  result.newDealname = newDealname;

  await updateDealFromQuote({
    dealId,
    quoteLink,
    quoteNumber,
    newDealname,
  });

  result.status = "completed";
  result.action = "deal_updated_from_quote";

  return result;
};

/**
 * =========================
 * LÓGICA 2: ASIGNACION FALLBACK LINK TO DEAL
 * =========================
 *
 * Objetivo:
 * Cuando al crear un negocio:
 * 1. Se crea un negocio desde cualquier pipeline
 * 2. Se le asigna automaticamente el link de fallback a la propiedad
 * paid_link_paypal, la cual es https://www.grupo-inducom.com/pago-en-paypal/
 */


//? LINK_FALLBACK_PAYPAL_DEAL
const updateDealAfterCreation = async ({
  dealId,
  paid_link_paypal,
}) => {
  return await hubspotRequest(`/crm/v3/objects/deals/${dealId}`, {
    method: "PATCH",
    body: `{
      "properties": {
        "${DEAL_PAID_LINK_PAYPAL_PROPERTY}": "${escapeJsonString(paid_link_paypal)}"
      }
    }`,
  });
}; 

const processDealFallbackLinkAssignment = async (dealId) => {
  const result = {
    module: "logic_2_deal_fallback_link_assignment",
    dealId,
    status: "pending",
    newPaidLinkPaypal: null,
    action: null,
  };

  await updateDealAfterCreation({
    dealId,
    paid_link_paypal: LINK_FALLBACK_PAYPAL_DEAL,
  });

  result.newPaidLinkPaypal = LINK_FALLBACK_PAYPAL_DEAL;
  result.status = "completed";
  result.action = "deal_paid_link_paypal_assigned";

  return result;
};




/**
 * =========================
 * ROUTER PRINCIPAL
 * =========================
 */

const runModuleSafe = async (moduleName, fn) => {
  try {
    return await fn();
  } catch (error) {
    return {
      module: moduleName,
      status: "error",
      message: error.message,
      details: error.data || null,
    };
  }
};

const runModulesForEvent = async ({
  objectType,
  objectId,
  subscriptionType,
  propertyName,
}) => {
  const moduleResults = [];

  /**
   * LÓGICA 1:
   * PROPERTY CHANGE: quote.hs_status
   */
  if (
    String(objectType).toLowerCase() === "quote" &&
    subscriptionType === "object.propertyChange" &&
    propertyName === QUOTE_STATUS_PROPERTY
  ) {
    moduleResults.push(
      await runModuleSafe("logic_1_quote_status_change", async () =>
        processQuoteStatusChange(objectId)
      )
    );

    return moduleResults;
  }

  /**
   * LÓGICA 2:
   * ASIGNACION FALLBACK LINK TO DEAL
   */

  if (
    String(objectType).toLowerCase() === "deal" &&
    subscriptionType === "object.creation"
  ) {
    moduleResults.push(
      await runModuleSafe("logic_2_deal_fallback_link_assignment", async () =>
        processDealFallbackLinkAssignment(objectId)
      )
    );

    return moduleResults;
  }
  

  moduleResults.push({
    module: "router",
    status: "skipped_no_matching_logic",
    objectType,
    objectId,
    subscriptionType,   
    propertyName,
  });

  return moduleResults;
};

/**
 * =========================
 * ENTRYPOINT HUBSPOT
 * =========================
 */

exports.main = async (context) => {
  try {
    const events = parseBody(context?.body);

    if (events.length === 0) {
      return jsonResponse(200, {
        ok: true,
        message: "No events received.",
        results: [],
      });
    }

    const results = [];

    for (const event of events) {
      const objectId = getObjectId(event);
      const objectType = getEventObjectType(event);
      const subscriptionType = getEventSubscriptionType(event);
      const propertyName = getEventPropertyName(event);

      if (!objectId) {
        results.push({
          status: "skipped_no_object_id",
          event,            
        });
        continue;
      }

      if (objectType === "unknown") {
        results.push({
          objectId,
          objectType,
          subscriptionType,
          propertyName,
          status: "skipped_unknown_object_type",
          event,
        });
        continue;
      }

      const moduleResults = await runModulesForEvent({
        objectType,
        objectId,
        subscriptionType,
        propertyName,
      });

      results.push({
        objectId,
        objectType,
        subscriptionType,
        propertyName,
        routedBy: `objectType_${objectType}`,
        status: "completed",
        moduleResults,
      });
    }

    return jsonResponse(200, {
      ok: true,
      processed: results.length,
      results,
    });
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      message: error.message || "Unexpected error.",
      details: error.data || null,
    });
  }
};