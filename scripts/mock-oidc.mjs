// A tiny OpenID Connect provider for trying company sign-in without Azure/Okta.
// It behaves like Microsoft Entra ID for this app: discovery document, sign-in page, code exchange
// with PKCE + client secret, RS256-signed ID tokens with a `roles` claim, and a key set.
//
//   node scripts/mock-oidc.mjs            # listens on http://localhost:4400
//
// Then start the app with:
//   SSO_ISSUER=http://localhost:4400 SSO_CLIENT_ID=mavericks-inventory SSO_CLIENT_SECRET=mock-secret SSO_PROVIDER_NAME="Mock company login"
//
// FOR TESTING ONLY. Anyone can pick any person on its sign-in page.
import { createHash, randomBytes } from "node:crypto"
import { createServer } from "node:http"
import { SignJWT, exportJWK, generateKeyPair } from "jose"

const PORT = Number(process.env.MOCK_OIDC_PORT || 4400)
const ISSUER = `http://localhost:${PORT}`
const CLIENT_ID = process.env.MOCK_OIDC_CLIENT_ID || "mavericks-inventory"
const CLIENT_SECRET = process.env.MOCK_OIDC_CLIENT_SECRET || "mock-secret"

export const PEOPLE = [
  { sub: "u-asha", name: "Asha Krishnan", email: "asha.krishnan@hexaware.example", roles: ["Inventory.Executive"], employeeid: "2000910001", note: "New executive (account is created on first sign-in)" },
  { sub: "u-ravi", name: "Ravi Shankar", email: "ravi.shankar@hexaware.example", roles: ["Inventory.Manager"], note: "New manager" },
  { sub: "u-neha", name: "Neha Joshi", email: "neha.joshi@hexaware.example", roles: ["Inventory.Authority"], note: "New Management Authority" },
  { sub: "u-kavin", name: "Kavin Raj", email: "executive@mavericks.demo", roles: ["Inventory.Executive"], note: "Existing user: linked by email" },
  { sub: "u-divya", name: "Divya Menon", email: "executive2@mavericks.demo", roles: ["Inventory.Manager"], note: "Existing executive, now a manager in the directory (role sync)" },
  { sub: "u-lata", name: "Lata Iyer", email: "lata.iyer@hexaware.example", roles: ["Inventory.Employee"], employeeid: "2000910002", note: "Employee: sees only their own points and goodies" },
  { sub: "u-sam", name: "Sam Thomas", email: "sam.thomas@hexaware.example", roles: [], note: "No app role assigned (should be refused)" },
  { sub: "u-ext", name: "Outside Partner", email: "partner@othercompany.example", roles: ["Inventory.Executive"], note: "Email domain outside the company" },
]

const { publicKey, privateKey } = await generateKeyPair("RS256")
const jwk = { ...(await exportJWK(publicKey)), kid: "mock-key-1", alg: "RS256", use: "sig" }
const codes = new Map() // code → { person, nonce, challenge, redirectUri }

const html = (body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mock company login</title>
<style>body{font:15px/1.5 system-ui,sans-serif;background:#eef1f5;color:#17202e;margin:0;padding:40px 16px}main{max-width:560px;margin:auto;background:#fff;border:1px solid #d8dee8;border-radius:12px;padding:24px}
h1{font-size:20px;margin:0 0 4px}p{color:#5b6577;margin:0 0 16px}a.person{display:block;padding:12px 14px;border:1px solid #d8dee8;border-radius:8px;margin-bottom:8px;color:inherit;text-decoration:none}
a.person:hover{border-color:#2350a8}small{display:block;color:#5b6577}.warn{background:#fbf0cf;color:#7a4b00;padding:8px 12px;border-radius:8px;font-size:13px}</style></head><body><main>${body}</main></body></html>`

function send(res, status, body, type = "application/json", extra = {}) {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", ...extra })
  res.end(typeof body === "string" ? body : JSON.stringify(body))
}

async function readForm(req) {
  let raw = ""
  for await (const chunk of req) raw += chunk
  return new URLSearchParams(raw)
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, ISSUER)
  const q = url.searchParams
  try {
    if (url.pathname === "/.well-known/openid-configuration") {
      return send(res, 200, {
        issuer: ISSUER,
        authorization_endpoint: `${ISSUER}/authorize`,
        token_endpoint: `${ISSUER}/token`,
        jwks_uri: `${ISSUER}/jwks`,
        end_session_endpoint: `${ISSUER}/logout`,
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["client_secret_post"],
      })
    }
    if (url.pathname === "/jwks") return send(res, 200, { keys: [jwk] })

    if (url.pathname === "/authorize") {
      if (q.get("client_id") !== CLIENT_ID) return send(res, 400, html("<h1>Unknown application</h1><p>client_id doesn't match.</p>"), "text/html")
      if (q.get("response_type") !== "code" || q.get("code_challenge_method") !== "S256" || !q.get("code_challenge"))
        return send(res, 400, html("<h1>Bad request</h1><p>Expected the code flow with PKCE (S256).</p>"), "text/html")
      const pass = new URLSearchParams({ redirect_uri: q.get("redirect_uri"), state: q.get("state") ?? "", nonce: q.get("nonce") ?? "", challenge: q.get("code_challenge") })
      const people = PEOPLE.map((p) => `<a class="person" href="/approve?${pass}&sub=${p.sub}"><strong>${p.name}</strong><small>${p.email}, roles: ${p.roles.join(", ") || "none"}</small><small>${p.note}</small></a>`).join("")
      return send(res, 200, html(`<h1>Mock company login</h1><p>Choose who to sign in as.</p><p class="warn">Test provider only. Real users sign in with Microsoft Entra ID.</p>${people}
        <a class="person" href="${q.get("redirect_uri")}?error=access_denied&error_description=User+cancelled&state=${encodeURIComponent(q.get("state") ?? "")}"><strong>Cancel</strong><small>Return to the app without signing in</small></a>`), "text/html")
    }

    if (url.pathname === "/approve") {
      const person = PEOPLE.find((p) => p.sub === q.get("sub"))
      if (!person) return send(res, 400, html("<h1>Unknown person</h1>"), "text/html")
      const code = randomBytes(24).toString("base64url")
      codes.set(code, { person, nonce: q.get("nonce"), challenge: q.get("challenge"), redirectUri: q.get("redirect_uri"), at: Date.now() })
      const back = new URL(q.get("redirect_uri"))
      back.searchParams.set("code", code)
      back.searchParams.set("state", q.get("state"))
      return send(res, 302, "", "text/plain", { Location: back.toString() })
    }

    if (url.pathname === "/token" && req.method === "POST") {
      const f = await readForm(req)
      if (f.get("client_id") !== CLIENT_ID || f.get("client_secret") !== CLIENT_SECRET) return send(res, 401, { error: "invalid_client", error_description: "Client id or secret is wrong" })
      const entry = codes.get(f.get("code"))
      codes.delete(f.get("code")) // one use only
      if (!entry || Date.now() - entry.at > 120_000) return send(res, 400, { error: "invalid_grant", error_description: "Code is unknown, used or expired" })
      if (entry.redirectUri !== f.get("redirect_uri")) return send(res, 400, { error: "invalid_grant", error_description: "redirect_uri mismatch" })
      const verifierHash = createHash("sha256").update(f.get("code_verifier") ?? "").digest("base64url")
      if (verifierHash !== entry.challenge) return send(res, 400, { error: "invalid_grant", error_description: "PKCE verification failed" })
      const p = entry.person
      const idToken = await new SignJWT({ name: p.name, email: p.email, preferred_username: p.email, roles: p.roles, employeeid: p.employeeid, nonce: entry.nonce })
        .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
        .setIssuer(ISSUER)
        .setAudience(CLIENT_ID)
        .setSubject(p.sub)
        .setIssuedAt()
        .setExpirationTime("10m")
        .sign(privateKey)
      return send(res, 200, { token_type: "Bearer", id_token: idToken, access_token: randomBytes(16).toString("hex"), expires_in: 600 })
    }

    if (url.pathname === "/logout") {
      const back = q.get("post_logout_redirect_uri")
      return send(res, 200, html(`<h1>Signed out of the mock provider</h1>${back ? `<p><a href="${back}">Back to the app</a></p>` : ""}`), "text/html")
    }
    send(res, 404, { error: "not_found" })
  } catch (e) {
    console.error(e)
    send(res, 500, { error: "server_error" })
  }
})

server.listen(PORT, () => console.log(`Mock OIDC provider on ${ISSUER} (client_id=${CLIENT_ID}, client_secret=${CLIENT_SECRET})`))
