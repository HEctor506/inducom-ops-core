# AGENTS.md

IMPORTANT: IF THE 'HubSpotDev' MCP SERVER IS INSTALLED USE THE TOOLS BEFORE TRYING TO MANUALLY USE CLI COMMANDS OR BEFORE TRYING TO DO ANYTHING WITH HUBSPOT ASSETS

## HubSpot Project Information
- The project configuration is in the `hsproject.json` file
- A directory is considered a part of the project if it or a directory above it contains a `hsproject.json` file
- The project src directory is defined in the `srcDir` field in the `hsproject.json`
- The project's platform version is defined in `platformVersion` in the `hs project.json`
- The `platformVersion` determines what features the project has access to as well as the shape of the configuration files

## Local Development
### Local Development Server (`hs project dev`)
- Start a local development server with `hs project dev` to view extension changes without refreshing
- The server runs on your local machine and syncs changes to HubSpot in real-time
- When the server is running, UI extensions (cards, settings pages) display a "Developing locally" tag
- Saving changes to JSX files automatically refreshes the page

### Local Proxy Configuration (`local.json`)
- During local development, you can proxy `hubspot.fetch()` requests to a locally running backend
- Create a `local.json` file in the same directory as your app's `*-hsmeta.json` file
- The proxy configuration maps HTTPS URLs to local URLs:
  ```json
  {
    "proxy": {
      "https://example.com": "http://localhost:8080"
    }
  }
  ```
- **Important**: Proxy URLs must be valid HTTPS URLs (the key, not the value)
- Path-based routing is NOT supported (e.g., `"https://example.com/a": "http://localhost:8080"` will not work)
- When a `local.json` file is detected, the CLI confirms the proxy is active
- To disable the proxy, rename the file to `local.json.bak` and restart the dev server

### Request Signing with CLIENT_SECRET
- You can inject the `CLIENT_SECRET` environment variable when starting the local dev server:
  ```shell
  CLIENT_SECRET="abc123" hs project dev
  ```
- This enables request signing during local development for testing secure backend communications

## npm packages
### `@hubspot/ui-extensions`
- In the `@hubspot/ui-extensions` npm package, only the component properties defined by the component are valid.  `style` properties are not valid

### `hubspot.fetch` API
- `hubspot.fetch` is a function provided by `@hubspot/ui-extensions` for making HTTP requests from UI components
- **Critical**: `hubspot.fetch` requires fully qualified domain names (FQDN) with HTTPS - relative paths are NOT supported
- All URLs must be added to the `permittedUrls.fetch` array in the app's `*-hsmeta.json` configuration file
- Example:
  ```json
  "permittedUrls": {
    "fetch": ["https://api.example.com", "https://api.hubapi.com"],
    "iframe": [],
    "img": []
  }
  ```
- Fetch URLs must be valid HTTPS URLs and cannot be `localhost`
- To call a local backend during development, use the `local.json` proxy configuration (see Local Development section)

## Component Information
### General
- Component configuration files must end with `-hsmeta.json`
- The `uid` field in the `-hsmeta.json` files must be unique with the project
- The `type` field in the `-hsmeta.json` files defines the type of the component
- Components can not be in nested subdirectories, only the specified directories in their corresponding component rules.
- Example components can be found in https://github.com/HubSpot/hubspot-project-components. The directories are split up by platform version and follow this format `${platformVersion}/components`. Note the project create tool only supports platform versions >= 2025.2.
- All component subdirectories must be in the project source directory

### app component
- There can only be one `app` component
- `app` component must be in the `app` directory
- If the `config.distribution` field is set to `marketplace`, the only valid `config.auth.type` value is `oauth`

### card
- `card` components must be in the `app/cards` directory
- The global `window` object is not available in the `card` component
- Cannot use `window.fetch`, and instead must use the `hubspot.fetch` function provided by the `@hubspot/ui-extensions` npm package.  Any urls called with the `hubspot.fetch` function must be added to the `config.permittedUrls.fetch` array in the `app` component's hsmeta.json file
- `hubspot.fetch` requires fully qualified HTTPS URLs (e.g., `https://api.example.com/endpoint`) - relative paths like `/api/endpoint` are NOT supported
- Only components exported from the `@hubspot/ui-extensions` npm package can be used in `card` components

### app-event
- `app-event` components must be in the `app/app-events` directory

### app-object
- `app-object` components must be in the `app/app-object` directory

### app-function
- `app-function` components must be in the `app/functions` directory
- `app-function` components are not available when `config.distribution` is set to `marketplace` in the `app` component `-hsmeta.son` file

# settings
- There can only be one `settings` component
- `settings` components must be in the `app/settings` directory
- The global `window` object is not available in the `settings` component
- Cannot use `window.fetch`, and instead must use the `hubspot.fetch` function provided by the `@hubspot/ui-extensions` npm package.  Any urls called with the `hubspot.fetch` function must be added to the `config.permittedUrls.fetch` array in the `app` component's `hsmeta.json` file
- `hubspot.fetch` requires fully qualified HTTPS URLs - relative paths are NOT supported
- Only components exported from the `@hubspot/ui-extensions` npm package can be used in `settings` components
- React Components from `@hubspot/ui-extensions/crm` cannot be used in `settings` components

# scim
- There can only be one `scim` component
- `scim` components must be in the `app/scim` directory

# webhooks
- There can only be one `webhooks` component.
- `webhooks` components must be in the `app/webhooks` directory

### workflow-actions
- `workflow-action` components must be in the `app/workflow-actions` directory

## HubSpot CLI commands
- All the commands and subcommands have a `--help` argument that provides details on the command and it's arguments
- The help output is standard yargs output
- The commands for working with projects in HubSpot are subcommands of `hs project`
- Debugging flag that can be added to `hs` commands and subcommands: `--debug`
- Debugging problems with CLI installation: `hs doctor`

### Project Commands
- `hs project create` - Create a new HubSpot project interactively
- `hs project upload` - Upload the project to HubSpot (build is created automatically)
- `hs project deploy` - Deploy a specific build of the project to make it live
- `hs project dev` - Start a local development server for real-time development of UI extensions
- `hs project watch` - Watch for file changes and automatically upload them
- `hs project list` - List all projects in the account
- `hs project download` - Download a project from HubSpot to local
- `hs project open` - Open the current project page in the browser
- `hs project logs` - View logs for deployed projects
- `hs project list-builds` - List all builds for a project
- `hs project validate` - Validate project configuration files
- `hs project migrate` - Migrate a project to a newer platform version
- `hs project migrate-app` - Migrate a legacy app to the projects framework
- `hs project clone-app` - Clone an existing app configuration

### Account Management
- `hs init` - Initial setup of the hubspot configuration file
- `hs account auth` - Authenticate a new account (requires browser interaction)
- `hs account list` - List all configured accounts
- `hs account use` - Switch the default account
- `hs account info` - Display information about an account
- `hs account rename` - Rename an account in the config
- `hs account remove` - Remove an account from the config
- `hs account clean` - Clean up invalid/expired authentication
- `hs account create-override` - Create a project-specific account override
- `hs account remove-override` - Remove a project-specific account override

### CMS Commands
- `hs cms upload <src> <dest>` - Upload files to HubSpot
- `hs cms fetch <src> <dest>` - Download files from HubSpot
- `hs cms watch <src> <dest>` - Watch for changes and automatically upload
- `hs cms list <path>` - List remote files in HubSpot
- `hs cms delete <path>` - Delete files from HubSpot
- `hs cms mv <srcPath> <destPath>` - Move/rename files in HubSpot
- `hs cms function list` - List all serverless functions
- `hs cms function logs <path>` - View logs for a serverless function
- `hs create template <name>` - Create a new template
- `hs create module <name>` - Create a new module
- `hs create function <name>` - Create a new serverless function
- `hs theme preview` - Preview a theme locally at https://hslocal.net:3000/

### Sandbox Management
- `hs sandbox create` - Create a development sandbox account
- `hs sandbox delete` - Delete a sandbox account

### Secrets Management
- `hs secret list` - List secrets for serverless functions
- `hs secret add <name> <value>` - Add a secret
- `hs secret update <name> <value>` - Update a secret
- `hs secret delete <name>` - Delete a secret

### Test Account Management
- `hs test-account create` - Create a configurable test account
- `hs test-account delete` - Delete a test account
- `hs test-account import-data` - Import test data

## General
- Follow existing patterns in the codebase
- Use proper component structure based on component `type` in the `-hsmeta.json` file
- Ensure configuration files follow HubSpot naming conventions
- Always validate that components are placed in correct directories
- When working with UI extensions, remember that `hubspot.fetch` requires HTTPS URLs in `permittedUrls.fetch`
- Use `hs project dev` for iterative development of cards and settings pages
- Use `local.json` to proxy API requests to a local backend during development

---

## Project: inducom-ops-core — crm-webhook-router

Contexto acumulado de sesiones de trabajo sobre `src/app/functions/crm-webhook-router.js`, para poder retomar el proyecto desde otra computadora sin perder el hilo.

### Por qué todo el código vive en un solo archivo
`crm-webhook-router.js` es un `app-function`. Las serverless functions de HubSpot se empaquetan de forma aislada: **no pueden hacer `require()` de archivos hermanos locales**, ni siquiera del mismo directorio (falla en runtime con `Cannot find module`). Por eso todo el cliente HTTP, constantes y lógica de negocio están duplicados dentro de ese único archivo, en vez de importarse.

- `src/app/functions/hubspot-client.js` existe pero es **código muerto** — nada lo puede importar por la razón de arriba. Se dejó como referencia de la limitación, no se usa.

### Endpoint y trigger
- Config: [crm-webhook-router-hsmeta.json](src/app/functions/crm-webhook-router-hsmeta.json) — `uid: crm_webhook_router_endpoint`, endpoint `POST /crm-webhook-router`.
- `secretKeys` debe quedar **vacío (`[]`)**. `PRIVATE_APP_ACCESS_TOKEN` es un nombre reservado en HubSpot — declararlo en `secretKeys` rompe `hs project upload` con `"... is a reserved keyword and cannot be used"`. El token se inyecta igual como `process.env.PRIVATE_APP_ACCESS_TOKEN` sin necesidad de declararlo ahí.
- Suscripciones activas en [webhooks-hsmeta.json](src/app/webhooks/webhooks-hsmeta.json): `object.creation` en `deal`, y `object.propertyChange` en `quote.hs_status`.

### Router (`runModulesForEvent`)
Recibe cada evento del payload de HubSpot (siempre llega como array, ver `parseBody`) y despacha por `objectType` + `subscriptionType` + `propertyName`:

- **Lógica 1** (`processQuoteStatusChange`) y **Lógica 3** (`processQuoteStatusChangePaypal`) se disparan juntas con el mismo trigger: `quote` + `object.propertyChange` + `hs_status`.
- **Lógica 2** (`processDealFallbackLinkAssignment`) se dispara con `deal` + `object.creation`.

### Lógica 1 — Quote status change → actualizar deal
Cuando cambia `quote.hs_status`: si no está en DRAFT, busca el deal asociado y, si el `dealname` no contiene ya el `hs_quote_number`, actualiza `url_cotizacion`, `id_negocio` y `dealname`.

### Lógica 2 — Fallback PayPal link en creación de deal
Al crear un deal, le asigna `paid_link_paypal` = `LINK_FALLBACK_PAYPAL_DEAL` (link de pago genérico) como valor por defecto.

### Lógica 3 — Quote status change → PayPal doorway (WF1)
Es la más compleja, traducida de un flujo de n8n existente (usaba `httpRequest` nodes contra la API de HubSpot). Solo corre cuando `hs_status === APPROVAL_NOT_NEEDED`; para cualquier otro status, corta temprano sin tocar nada (`skipped_quote_is_approval_not_needed`).

Cuando sí corre, en orden:
1. `getQuote(quoteId)` → trae la cotización (`QUOTE_PROPERTIES`, incluye `hs_quote_amount` y `hs_currency`).
2. `getDealAssociationForQuote(quoteId)` → deal asociado.
3. En paralelo: `getDealProperties(dealId)` (con `DEAL_PROPERTIES`, incluye campos PayPal), `getCompanyAssociationForDeal`, `getContactAssociationForDeal`, `getLineItemAssociationToQuote(quoteId)`.
4. `readBatchOfLineItems(lineItemIds)` con los `toObjectId` de las asociaciones de line items.
5. **`calculateInducomQuoteFinancials`** (§11.3) — calcula subtotal/descuento/impuesto/total por line item. Soporta `hs_discount_percentage`/`hs_tax_rate` (%) o `discount`/`tax` (monto fijo). El impuesto se calcula sobre el neto (después de descuento).
   - ⚠️ **PENDIENTE (§46-P1, sin resolver)**: confirmar contra la plantilla real de Inducom si el descuento se aplica antes o después del impuesto, y el redondeo exacto. Mientras no se confirme, si el total calculado no coincide con `hs_quote_amount`, la Lógica 3 corta con `TOTAL_MISMATCH` en cada cotización.
6. **Validación cruzada** (§11.4) — si `|computed.total - hs_quote_amount| > 0.01`, corta: `sync_status = "ERROR"`, `last_error_code = "TOTAL_MISMATCH"`. No se crea orden, no se toca ningún link, no hay retry automático.
7. **`buildNormalizedSnapshot`** (§11.5) — arma un objeto normalizado (schema_version 1) con `quote`, `economics`, `line_items` (ordenados por `sku+name`) y `metadata` (company/contact). `paypal_fee` queda fijo en `0` mientras `PAYPAL_FEE_ENABLED = false` (regla R11).
8. **Fingerprints** (§12) — `paymentFingerprint` (hash de lo económico) y `metadataFingerprint` (hash de company/contacto) vía SHA-256 sobre un `stableStringify` (JSON con keys ordenadas). Están separados a propósito: un cambio de teléfono del contacto no debe disparar una orden PayPal nueva.
9. **Notificación a n8n** — `notifyN8nFase1(payload)` hace `POST` (JSON) a `https://inducom.app.n8n.cloud/webhook/fase1` con todo lo recolectado (deal, company, contacts, line items, financials, snapshot, ambos fingerprints). Solo se dispara cuando el flujo llega a `completed`. Un fallo del POST se captura en `result.n8nNotification` y no rompe la respuesta al webhook de HubSpot.

### Gotchas para recordar
- No agregar nombres a `secretKeys` sin pedirlo explícitamente al usuario — `PRIVATE_APP_ACCESS_TOKEN` específicamente **nunca** va ahí (ver arriba).
- `result.lineItems` (de `readBatchOfLineItems`) son objetos crudos de HubSpot (`{ id, properties: {...} }`), no objetos planos — todo cálculo sobre ellos debe leer `li.properties.*`.
- Este archivo requiere `crypto` (módulo nativo de Node, no un archivo hermano) para los fingerprints — sí es válido usarlo, a diferencia de imports locales.
