// A separate private container keeps unpublished drafts out of public media.
const CONTAINER = "hidi-private-policies";
let tokenCache;
async function accessToken() {
  if (tokenCache?.expires > Date.now() + 120_000) return tokenCache.token;
  const url = new URL(process.env.IDENTITY_ENDPOINT || "http://169.254.169.254/metadata/identity/oauth2/token");
  url.searchParams.set("api-version", process.env.IDENTITY_ENDPOINT ? "2019-08-01" : "2018-02-01");
  url.searchParams.set("resource", "https://storage.azure.com/");
  const clientId = process.env.AZURE_CLIENT_ID || process.env.MANAGED_IDENTITY_CLIENT_ID;
  if (clientId) url.searchParams.set("client_id", clientId);
  const headers = process.env.IDENTITY_ENDPOINT ? { "X-IDENTITY-HEADER": process.env.IDENTITY_HEADER || "" } : { Metadata: "true" };
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
  const body = await response.json();
  if (!response.ok || typeof body.access_token !== "string") throw new Error("Managed storage identity unavailable");
  tokenCache = { token: body.access_token, expires: Date.now() + Math.max(0, Number(body.expires_in || 300)) * 1000 };
  return tokenCache.token;
}

export function createAzurePolicyStore() {
  async function request(method, key, value, etag) {
    const account = (process.env.AZURE_STORAGE_ACCOUNT || "").trim();
    if (!/^[a-z0-9]{3,24}$/.test(account)) throw new Error("Private policy storage unavailable");
    const endpoint = new URL(process.env.AZURE_STORAGE_BLOB_ENDPOINT || `https://${account}.blob.core.windows.net/`);
    if (endpoint.protocol !== "https:" || endpoint.hostname !== `${account}.blob.core.windows.net`) throw new Error("Invalid private storage endpoint");
    endpoint.pathname = `/${CONTAINER}/${key}`;
    const headers = { Authorization: `Bearer ${await accessToken()}`, "x-ms-version": "2023-11-03", "x-ms-date": new Date().toUTCString() };
    if (method === "PUT") {
      headers[etag ? "If-Match" : "If-None-Match"] = etag || "*";
      headers["x-ms-blob-type"] = "BlockBlob";
      headers["Content-Type"] = "application/json";
    }
    const response = await fetch(endpoint, { method, headers, body: value === undefined ? undefined : JSON.stringify(value), signal: AbortSignal.timeout(15_000) });
    if (response.status === 404 && method === "GET") return { value: null, etag: null };
    if (response.status === 409 || response.status === 412) throw Object.assign(new Error("Policy changed in another session. Reload before saving."), { status: 409 });
    if (!response.ok) throw new Error("Private policy storage unavailable");
    if (method === "PUT") return { etag: response.headers.get("etag") };
    const length = Number(response.headers.get("content-length"));
    if (length > 1024 * 1024) throw new Error("Policy state exceeds limit");
    const body = await response.text();
    if (Buffer.byteLength(body) > 1024 * 1024) throw new Error("Policy state exceeds limit");
    return { value: JSON.parse(body), etag: response.headers.get("etag") };
  }
  return {
    load: () => request("GET", "state.json"),
    save: (state, etag) => request("PUT", "state.json", state, etag),
    archive: (revision) => request("PUT", `versions/${revision.id}.json`, revision),
    version: (id) => request("GET", `versions/${id}.json`),
  };
}
