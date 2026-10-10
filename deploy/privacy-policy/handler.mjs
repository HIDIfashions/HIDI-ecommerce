import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { initialDraft } from "./defaults.mjs";
import { createAzurePolicyStore } from "./storage.mjs";

const API = "/api/hidi/privacy-policy/admin";
const fields = ["businessName", "address", "officerName", "officerEmail", "officerPhone", "effectiveDate"];
const placeholder = /\[[^\]]+\]|\b(?:placeholder|todo|tbd)\b|example\.(?:com|org)|your[- ](?:name|address|email)/i;
const esc = value => String(value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const fail = (status, message) => Object.assign(new Error(message), { status });

export function validateDraft(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw fail(400, "Invalid policy draft");
  const draft = {};
  for (const field of fields) {
    if (typeof input[field] !== "string" || input[field].length > (field === "address" ? 2000 : 300)) throw fail(400, `Invalid ${field}`);
    draft[field] = input[field].trim();
  }
  if (!Array.isArray(input.sections) || input.sections.length < 1 || input.sections.length > 20) throw fail(400, "Add between 1 and 20 policy sections");
  draft.sections = input.sections.map(section => {
    if (typeof section?.title !== "string" || !section.title.trim() || section.title.length > 150 || typeof section.text !== "string" || !section.text.trim() || section.text.length > 12000) throw fail(400, "Each section needs a heading and text within the limits");
    return { title: section.title.trim(), text: section.text.trim() };
  });
  if (Buffer.byteLength(JSON.stringify(draft)) > 100 * 1024) throw fail(400, "Policy draft is too large");
  return draft;
}

function substitute(text, draft) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, name) => fields.includes(name) && draft[name] ? draft[name] : `[${name}]`);
}

export function publicationProblems(draft) {
  const errors = fields.filter(name => !draft[name] || placeholder.test(draft[name])).map(name => `Complete ${name}`);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.officerEmail)) errors.push("Enter a monitored privacy officer email");
  if (!/^\+?[\d ()-]{7,30}$/.test(draft.officerPhone)) errors.push("Enter a privacy officer telephone number");
  const date = new Date(`${draft.effectiveDate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.effectiveDate) || !Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== draft.effectiveDate || date > new Date()) errors.push("Enter a valid effective date on or before today");
  if (draft.sections.some(section => placeholder.test(section.title) || placeholder.test(substitute(section.text, draft)) || /\{\{|\}\}/.test(substitute(section.text, draft)))) errors.push("Replace the remaining policy text placeholders");
  return [...new Set(errors)];
}

export function renderPolicy(draft, { preview = false, version = "Draft" } = {}) {
  const sections = draft.sections.map(section => `<section><h2>${esc(section.title)}</h2>${substitute(section.text, draft).split(/\n\s*\n/).map(p => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("")}</section>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="${preview ? "noindex,nofollow" : "index,follow"}"><title>Privacy policy | HIDI</title><link rel="stylesheet" href="/privacy-policy-assets/policy.css"></head><body><main class="policy"><a href="/">HIDI · Wear the feeling</a>${preview ? '<p class="notice">ADMIN PREVIEW · Unpublished draft</p>' : ""}<h1>Privacy policy</h1><p class="meta">${esc(version)} · Effective ${esc(draft.effectiveDate || "[add effective date]")}</p>${sections}<p class="meta">Operated by ${esc(draft.businessName)} · ${esc(draft.address || "[add business address]")}</p></main></body></html>`;
}

async function readJson(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers["content-type"] || "")) throw fail(415, "Use application/json");
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 110 * 1024) throw fail(413, "Policy request is too large");
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { throw fail(400, "Invalid JSON"); }
}

function sameOrigin(request) {
  if (request.headers["sec-fetch-site"] === "cross-site") return false;
  try {
    const origin = new URL(request.headers.origin || "");
    // Azure terminates TLS. Use the validated browser origin and exact Host;
    // never trust user-supplied forwarded host/protocol headers.
    const local = /^127\.0\.0\.1(?::\d+)?$|^localhost(?::\d+)?$/.test(request.headers.host || "");
    return origin.host === request.headers.host && (origin.protocol === "https:" || (local && origin.protocol === "http:"));
  } catch { return false; }
}

export function createPrivacyPolicyHandler({ origin, hasStorefront, store = createAzurePolicyStore() }) {
  async function loadState() {
    let loaded = await store.load();
    if (!loaded.value) {
      // Seed only the authorized private draft. CAS protects concurrent replicas.
      try { await store.save({ schema: 1, draft: initialDraft(), published: null, history: [] }, null); }
      catch (error) { if (error.status !== 409) throw error; }
      loaded = await store.load();
      if (!loaded.value) throw new Error("Private draft unavailable");
    }
    return loaded;
  }
  async function owner(request) {
    if (!hasStorefront || !request.headers.cookie) throw fail(401, "Staff sign-in required");
    let session;
    try {
      session = await fetch(new URL("/api/admin/session", origin), { headers: { cookie: request.headers.cookie }, redirect: "manual", signal: AbortSignal.timeout(5000) });
    } catch { throw fail(503, "Staff verification unavailable"); }
    if (!session.ok) throw fail(session.status === 403 ? 403 : 401, "Staff sign-in required");
    const profile = await session.json().catch(() => null);
    if (profile?.admin?.role !== "OWNER" || typeof profile.admin.id !== "string") throw fail(403, "Only the HIDI owner can manage privacy information");
    return { id: profile.admin.id, displayName: String(profile.admin.displayName || "Owner") };
  }
  function send(request, response, status, body, type = "application/json; charset=utf-8") {
    const data = type.startsWith("application/json") ? JSON.stringify(body) : body;
    response.writeHead(status, { "Content-Type": type, "Content-Length": Buffer.byteLength(data), "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin", "X-Frame-Options": "DENY", "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'", ...(status >= 400 || type.includes("html") && body.includes("Unpublished") ? { "X-Robots-Tag": "noindex, nofollow" } : {}) });
    response.end(request.method === "HEAD" ? undefined : data);
  }
  return async (request, response, pathname) => {
    if (!["/privacy", "/admin/privacy-policy", "/api/hidi/privacy-policy", API, `${API}/preview`].includes(pathname) && !pathname.startsWith("/privacy-policy-assets/")) return false;
    try {
      if (pathname.startsWith("/privacy-policy-assets/")) {
        const filename = pathname.slice("/privacy-policy-assets/".length);
        if (!["editor.js", "links.js", "policy.css"].includes(filename)) throw fail(404, "Not found");
        if (!["GET", "HEAD"].includes(request.method)) throw fail(405, "Method not allowed");
        send(request, response, 200, readFileSync(new URL(filename, import.meta.url), "utf8"), filename.endsWith("js") ? "text/javascript; charset=utf-8" : "text/css; charset=utf-8");
        return true;
      }
      if (pathname === "/admin/privacy-policy") {
        if (!["GET", "HEAD"].includes(request.method)) throw fail(405, "Method not allowed");
        // Shell has no draft data. The API still verifies OWNER for every read/write.
        send(request, response, 200, readFileSync(new URL("editor.html", import.meta.url), "utf8"), "text/html; charset=utf-8");
        return true;
      }
      if (pathname === "/privacy" || pathname === "/api/hidi/privacy-policy") {
        if (!["GET", "HEAD"].includes(request.method)) throw fail(405, "Method not allowed");
        const { value } = await loadState();
        const published = value?.published;
        if (pathname === "/api/hidi/privacy-policy") send(request, response, 200, { published: Boolean(published), ...(published ? { version: published.version, effectiveDate: published.draft.effectiveDate, url: "/privacy" } : {}) });
        else if (published) send(request, response, 200, renderPolicy(published.draft, { version: `Version ${published.version}` }), "text/html; charset=utf-8");
        else send(request, response, 404, '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Privacy policy | HIDI</title><link rel="stylesheet" href="/privacy-policy-assets/policy.css"></head><body><main class="policy"><a href="/">Back to HIDI</a><h1>Privacy policy</h1><p>No published privacy policy is available yet.</p></main></body></html>', "text/html; charset=utf-8");
        return true;
      }
      if (!(["GET", "HEAD"].includes(request.method) || pathname === API && request.method === "POST")) throw fail(405, "Method not allowed");
      if (request.method === "POST" && !sameOrigin(request)) throw fail(403, "Use the HIDI admin portal to make changes");
      const actor = await owner(request);
      const loaded = await loadState();
      const state = loaded.value || { schema: 1, draft: initialDraft(), published: null, history: [] };
      if (pathname.endsWith("/preview")) {
        const versionId = new URL(request.url, "http://localhost").searchParams.get("version");
        if (versionId) {
          if (!/^[0-9a-f-]{36}$/.test(versionId) || !state.history.some(v => v.id === versionId)) throw fail(404, "Version not found");
          const archived = (await store.version(versionId)).value;
          if (!archived) throw fail(404, "Version not found");
          send(request, response, 200, renderPolicy(archived.draft, { preview: true, version: `Archived version ${archived.version}` }), "text/html; charset=utf-8");
        } else send(request, response, 200, renderPolicy(state.draft, { preview: true }), "text/html; charset=utf-8");
      } else if (request.method !== "POST") {
        send(request, response, 200, { ...state, etag: loaded.etag, problems: publicationProblems(state.draft), owner: actor.displayName });
      } else {
        const body = await readJson(request);
        if (body.etag !== loaded.etag) throw fail(409, "Policy changed in another session. Reload before saving.");
        const now = new Date().toISOString();
        if (body.action === "save") {
          state.draft = validateDraft(body.draft);
          state.savedAt = now;
          state.savedBy = actor;
        } else if (body.action === "publish") {
          if (body.approved !== true) throw fail(400, "Confirm approval before publication");
          const draft = validateDraft(state.draft);
          const problems = publicationProblems(draft);
          if (problems.length) throw fail(422, problems.join(". "));
          const revision = { id: randomUUID(), version: (state.published?.version || 0) + 1, draft, publishedAt: now, approvedBy: actor, contentHash: createHash("sha256").update(JSON.stringify(draft)).digest("hex") };
          await store.archive(revision);
          state.published = revision;
          state.history = [{ id: revision.id, version: revision.version, publishedAt: now, effectiveDate: draft.effectiveDate, contentHash: revision.contentHash }, ...state.history].slice(0, 1000);
        } else throw fail(400, "Choose save or publish");
        const saved = await store.save(state, loaded.etag);
        send(request, response, 200, { ...state, etag: saved.etag, problems: publicationProblems(state.draft), owner: actor.displayName });
      }
    } catch (error) {
      send(request, response, error.status || 503, { message: error.status ? error.message : "Privacy information is temporarily unavailable. Please retry." });
    }
    return true;
  };
}
