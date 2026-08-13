/**
 * =========================
 * CLIENTE BASE HUBSPOT
 * =========================
 *
 * NOTA: Las serverless functions de HubSpot no pueden importar archivos
 * locales hermanos (require("./hubspot-client") falla en runtime con
 * "Cannot find module"). Todo el código debe vivir en este archivo.
 */

const crypto = require("crypto");

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
 * N8N WEBHOOK
 * =========================
 */

const N8N_FASE1_WEBHOOK_URL =
  "https://inducom.app.n8n.cloud/webhook/fase1";

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
 * ===================================================================
 *                  -------- CRM ESSENTIALS --------
 * ===================================================================
 */
/**
 * =========================
 * -------- QUOTES --------
 * =========================
 */

const QUOTE_STATUS_PROPERTY = "hs_status";
const DEAL_QUOTE_URL_PROPERTY = "url_cotizacion";

const HS_STATUS = {
  DRAFT: "DRAFT",
  PENDING_APPROVAL: "PENDING_APPROVAL",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  APPROVAL_NOT_NEEDED: "APPROVAL_NOT_NEEDED"
};

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
  "hs_quote_amount",
  "hs_currency",
];


/**
 * =========================
 * -------- DEALS --------
 * =========================
 */

const DEAL_ID_NEGOCIO_PROPERTY = "id_negocio";
const DEAL_PAID_LINK_PAYPAL_PROPERTY = "paid_link_paypal";
const LINK_FALLBACK_PAYPAL_DEAL  = "https://www.grupo-inducom.com/pago-en-paypal/";

const DEAL_PROPERTIES = [
  "codigo_de_cliente",
  "dealname",
  "paid_link_paypal",
  "paypal_order_id",
  "paypal_capture_id",
  "monto_paypal",
  "version_paypal",
  "comision_paypal",
  "estado_pago_paypal",
  "ultimo_error_paypal",
  "fecha_de_pago_paypal",
  "pipeline",
];

const LINE_ITEM_PROPERTIES = [
  "name",
  "hs_sku",
  "quantity",
  "price",
  "amount",
  "hs_product_id",
];


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
  if (String(quoteStatus) === HS_STATUS.DRAFT) {
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
 * LÓGICA 3: QUOTE STATUS CHANGE - PAYPAL DOORWAY AKA. WF1
 * =========================
 *
 * Objetivo:
 * GET /crm/v3/objects/quotes/{quoteId} con properties y associations=deals,line_items
 * GET /crm/v3/objects/deals/{dealId} con las propiedades PayPal
 * GET /crm/v3/objects/deals/{dealId}/associations/companies → GET companies/{id}
 * GET /crm/v3/objects/deals/{dealId}/associations/contacts → GET contacts/{id}
 * GET /crm/v3/objects/line_items/batch/read con los ids asociados a la quote
 * 
 */

//GET /crm/v3/objects/quotes/{quoteId} con properties y associations=deals,line_items
const getQuote = async (quoteId) => {
  return await hubspotRequest(
    `/crm/v3/objects/quotes/${quoteId}?properties=${QUOTE_PROPERTIES.join(
      ","
    )}&archived=false`,
    { method: "GET" }
  );
};

const getDealAssociationForQuote = async (quoteId) => {
  return await hubspotRequest(
    `/crm/v3/objects/quotes/${quoteId}/associations/deals`,
    { method: "GET" }
  );
};
 
//GET /crm/v3/objects/deals/{dealId} con las propiedades PayPal
const getDealProperties = async (dealId) => {
  return await hubspotRequest(
    `/crm/v3/objects/deals/${dealId}?properties=${DEAL_PROPERTIES.join(
      ",")}`,
    { method: "GET" }
  );
};

//GET /crm/v3/objects/deals/{dealId}/associations/companies → GET companies/{id}
const getCompanyAssociationForDeal = async (dealId) => {
  return await hubspotRequest(
    `/crm/v3/objects/deals/${dealId}/associations/companies`,
    { method: "GET" }
  );
};


//GET /crm/v3/objects/deals/{dealId}/associations/contacts → GET contacts/{id}
const getContactAssociationForDeal = async (dealId) => {
  return await hubspotRequest(
    `/crm/v3/objects/deals/${dealId}/associations/contacts`,
    { method: "GET" }
  );
};

const getLineItemAssociationToQuote = async (quoteId) => {
  return await hubspotRequest(
    `/crm/v4/objects/quotes/${quoteId}/associations/line_items`,
    { method: "GET" }
  );
};


const readBatchOfLineItems = async (lineItemIds) => {
  return await hubspotRequest(`/crm/v3/objects/line_items/batch/read`, {
    method: "POST",
    body: JSON.stringify({
      inputs: (lineItemIds || []).map((id) => ({ id })),
      properties: LINE_ITEM_PROPERTIES,
      propertiesWithHistory: [],
    }),
  });
};



const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

//§11.3 — PENDIENTE (§46-P1): confirmar contra la plantilla real de Inducom si el
//descuento se aplica antes o después del impuesto, y el redondeo exacto.
const calculateInducomQuoteFinancials = (lineItems, quoteProps) => {
  let subtotal = 0;
  let discount = 0;
  let tax = 0;

  for (const li of lineItems) {
    const props = li?.properties || {};
    const qty = Number(props.quantity ?? 0);
    const unitPrice = Number(props.price ?? 0);
    const gross = round2(qty * unitPrice);

    const lineDiscount = props.hs_discount_percentage
      ? round2((gross * Number(props.hs_discount_percentage)) / 100)
      : round2(Number(props.discount ?? 0));

    const net = round2(gross - lineDiscount);
    const lineTax = props.hs_tax_rate
      ? round2((net * Number(props.hs_tax_rate)) / 100)
      : round2(Number(props.tax ?? 0));

    subtotal += gross;
    discount += lineDiscount;
    tax += lineTax;
  }

  subtotal = round2(subtotal);
  discount = round2(discount);
  tax = round2(tax);
  const total = round2(subtotal - discount + tax);

  return {
    subtotal,
    discount,
    tax,
    total,
    currency: quoteProps?.hs_currency || "USD",
  };
};

//§11.5 — snapshot normalizado; el fingerprint (§12) se calcula sobre esta forma exacta.
const buildNormalizedSnapshot = ({
  quote,
  dealId,
  computed,
  lineItems,
  companies,
  contacts,
}) => ({
  schema_version: 1,
  quote: {
    quote_number: quote.properties.hs_quote_number,
    hubspot_quote_id: quote.id,
    hubspot_deal_id: dealId,
    currency: computed.currency,
    expiration_date: quote.properties.hs_expiration_date || null,
  },
  economics: {
    subtotal: computed.subtotal,
    discount: computed.discount,
    tax: computed.tax,
    total: computed.total,
    paypal_fee: 0, // R11: fijo en 0 mientras PAYPAL_FEE_ENABLED = false
    paypal_total: computed.total,
    fee_formula_version: null,
  },
  line_items: lineItems
    .map((li) => {
      const props = li.properties || {};
      const quantity = Number(props.quantity ?? 0);
      const unitPrice = Number(props.price ?? 0);
      const gross = round2(quantity * unitPrice);

      const discount = props.hs_discount_percentage
        ? round2((gross * Number(props.hs_discount_percentage)) / 100)
        : round2(Number(props.discount ?? 0));

      const net = round2(gross - discount);
      const tax = props.hs_tax_rate
        ? round2((net * Number(props.hs_tax_rate)) / 100)
        : round2(Number(props.tax ?? 0));

      return {
        sku: props.hs_sku || null,
        name: props.name,
        quantity,
        unit_price: unitPrice,
        discount,
        tax,
        line_total: round2(net + tax),
      };
    })
    .sort((a, b) => (a.sku + a.name).localeCompare(b.sku + b.name)),
  metadata: {
    company_id: companies[0]?.id || null,
    company_name: companies[0]?.properties?.name || null,
    tax_id: companies[0]?.properties?.tax_id || null,
    contact_id: contacts[0]?.id || null,
    contact_name: contacts[0]?.properties?.firstname || null,
    email: contacts[0]?.properties?.email || null,
    phone: contacts[0]?.properties?.phone || null,
    country: contacts[0]?.properties?.country || "EC",
  },
  captured_at: new Date().toISOString(),
});

//§12 — fingerprints
const stableStringify = (value) => {
  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]";
  }
  if (value && typeof value === "object") {
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + stableStringify(value[k]))
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(value);
};

const paymentFingerprint = (snapshot) => {
  const payload = {
    currency: snapshot.quote.currency,
    subtotal: snapshot.economics.subtotal,
    discount: snapshot.economics.discount,
    tax: snapshot.economics.tax,
    total: snapshot.economics.total,
    paypal_fee: snapshot.economics.paypal_fee,
    paypal_total: snapshot.economics.paypal_total,
    fee_formula_version: snapshot.economics.fee_formula_version,
    items: snapshot.line_items,
  };
  return crypto.createHash("sha256").update(stableStringify(payload)).digest("hex");
};

const metadataFingerprint = (snapshot) => {
  return crypto
    .createHash("sha256")
    .update(stableStringify(snapshot.metadata))
    .digest("hex");
};

const notifyN8nFase1 = async (payload) => {
  const response = await fetch(N8N_FASE1_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await response.text();

  return {
    ok: response.ok,
    statusCode: response.status,
    body: text || null,
  };
};

const processQuoteStatusChangePaypal = async (quoteId) => {
  const result = {
    module: "logic_3_quote_status_change_paypal",
    quoteId,
    dealId: null,
    status: "pending",
    hs_status: null,
    hs_quote_number: null,
    hs_quote_link: null,
    deal: null,
    companies: [],
    contacts: [],
    lineItems: [],
    financials: null,
    snapshot: null,
    paymentFingerprint: null,
    metadataFingerprint: null,
    n8nNotification: null,
    newPaidLinkPaypal: null,
    sync_status: null,
    last_error_code: null,
    action: null,
  };

  const quote = await getQuote(quoteId);

  if (!quote) {
    result.status = "skipped_quote_not_found";
    result.action = "no_change";
    return result;
  }

  const quoteStatus = quote?.properties?.hs_status || null;
  const quoteLink = quote?.properties?.hs_quote_link || null;
  const quoteNumber = quote?.properties?.hs_quote_number || null;

  result.hs_status = quoteStatus;
  result.hs_quote_number = quoteNumber;
  result.hs_quote_link = quoteLink;

  if (!quoteStatus) {
    result.status = "skipped_no_quote_status";
    result.action = "no_change";
    return result;
  }

  //? Si la cotización no está en APPROVAL_NOT_NEEDED, significa que aún no esta publicada
  if (String(quoteStatus) !== HS_STATUS.APPROVAL_NOT_NEEDED) {
    result.status = "skipped_quote_is_approval_not_needed";
    result.action = "no_change";

    //Aqui se hara upsert

    return result;
    //? Se omite la acción de asignar el link de pago si la cotización no está en APPROVAL_NOT_NEEDED
  }

  //?Caso contrario, si la cotización está en APPROVAL_NOT_NEEDED, se procede a buscar el negocio asociado y asignar el link de pago.

  const dealAssociation = await getDealAssociationForQuote(quoteId);
  const dealId = dealAssociation?.results?.[0]?.id || null;

  if (!dealId) {
    result.status = "skipped_no_deal_associated";
    result.action = "no_change";
    return result;
  }

  result.dealId = dealId;

  //? Consultar datos del negocio, la empresa asociada, el contacto asociado y los line items asociados.
  const [deal, companyAssociation, contactAssociation, lineItemAssociations] =
    await Promise.all([
      getDealProperties(dealId),
      getCompanyAssociationForDeal(dealId),
      getContactAssociationForDeal(dealId),
      getLineItemAssociationToQuote(quoteId),
    ]);

  //? Obtener los IDs de los line items asociados a la cotización.
  const lineItemIds = (lineItemAssociations?.results || [])
    .map((association) => association?.toObjectId)
    .filter(Boolean);

  const lineItemsBatch = lineItemIds.length
    ? await readBatchOfLineItems(lineItemIds)
    : { results: [] };

  result.deal = deal || null;
  result.companies = companyAssociation?.results || [];
  result.contacts = contactAssociation?.results || [];
  result.lineItems = lineItemsBatch?.results || [];

  //? §11.3 — cálculo financiero de la cotización a partir de los line items.
  const computed = calculateInducomQuoteFinancials(
    result.lineItems,
    quote.properties
  );
  result.financials = computed;

  //? §11.4 — validación cruzada contra hs_quote_amount. Si no coincide, se corta
  //? acá: no se crea orden, no se toca el link, no hay retry automático.
  const hubspotTotal = Number(quote.properties.hs_quote_amount ?? 0);

  if (Math.abs(computed.total - hubspotTotal) > 0.01) {
    result.status = "error";
    result.sync_status = "ERROR";
    result.last_error_code = "TOTAL_MISMATCH";
    result.action = "no_change";
    return result;
  }

  //? §11.5 — snapshot normalizado (base del fingerprint en §12).
  const snapshot = buildNormalizedSnapshot({
    quote,
    dealId,
    computed,
    lineItems: result.lineItems,
    companies: result.companies,
    contacts: result.contacts,
  });

  result.snapshot = snapshot;
  result.paymentFingerprint = paymentFingerprint(snapshot);
  result.metadataFingerprint = metadataFingerprint(snapshot);

  const correlationId = `quote:${quoteNumber}:incoming`;
  result.correlationId = correlationId;

  //? Notificar a n8n (fase 1) con toda la info recolectada. Un fallo acá no debe
  //? tumbar la respuesta del webhook de HubSpot.
  try {
    result.n8nNotification = await notifyN8nFase1({
      quoteId,
      dealId,
      correlation_id: correlationId,
      hs_status: quoteStatus,
      hs_quote_number: quoteNumber,
      hs_quote_link: quoteLink,
      deal: result.deal,
      companies: result.companies,
      contacts: result.contacts,
      lineItems: result.lineItems,
      financials: computed,
      snapshot,
      paymentFingerprint: result.paymentFingerprint,
      metadataFingerprint: result.metadataFingerprint,
    });
  } catch (error) {
    result.n8nNotification = {
      ok: false,
      error: error.message || "Unexpected error notifying n8n.",
    };
  }

  result.newPaidLinkPaypal = LINK_FALLBACK_PAYPAL_DEAL;
  result.sync_status = "OK";
  result.status = "completed";

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

    moduleResults.push(
      await runModuleSafe("logic_3_quote_status_change_paypal", async () =>
        processQuoteStatusChangePaypal(objectId)
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