const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/v1").replace(/\/$/, "");
const STORAGE_KEY = "hidi_supabase_session";
const FIREBASE_JS_VERSION = "10.14.1";
const CUSTOMER_AUTH_PROVIDER = (
  process.env.NEXT_PUBLIC_CUSTOMER_AUTH_PROVIDER ??
  process.env.NEXT_PUBLIC_HIDI_AUTH_PROVIDER ??
  ""
).trim().toLowerCase();
const FIREBASE_CONFIG = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
};

type StoredSession = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: { id: string; email?: string | null; phone?: string | null };
};

type FirebaseConfirmationResult = {
  confirm(code: string): Promise<{ user: { getIdToken(forceRefresh?: boolean): Promise<string> } }>;
};

type FirebaseRecaptchaVerifier = {
  render(): Promise<number>;
  clear(): void;
};

type FirebaseAuthCompat = {
  signInWithPhoneNumber(phone: string, verifier: FirebaseRecaptchaVerifier): Promise<FirebaseConfirmationResult>;
  signOut(): Promise<void>;
};

type FirebaseAuthFactory = {
  (): FirebaseAuthCompat;
  RecaptchaVerifier: new (
    container: HTMLElement | string,
    parameters?: Record<string, unknown>,
  ) => FirebaseRecaptchaVerifier;
};

type FirebaseNamespace = {
  apps: unknown[];
  initializeApp(config: typeof FIREBASE_CONFIG): unknown;
  auth: FirebaseAuthFactory;
};

declare global {
  interface Window {
    firebase?: FirebaseNamespace;
    __hidiFirebaseScripts?: Promise<void>;
    __hidiRecaptchaVerifier?: FirebaseRecaptchaVerifier;
  }
}

let pendingFirebaseConfirmation: FirebaseConfirmationResult | null = null;
let pendingFirebasePhone: string | null = null;

function firebaseConfigured() {
  return Boolean(
    API_URL &&
    FIREBASE_CONFIG.apiKey &&
    FIREBASE_CONFIG.authDomain &&
    FIREBASE_CONFIG.projectId &&
    FIREBASE_CONFIG.appId,
  );
}

function customerAuthProvider() {
  if (CUSTOMER_AUTH_PROVIDER) return CUSTOMER_AUTH_PROVIDER;
  return firebaseConfigured() ? "firebase" : "hidi";
}

function configured() {
  return customerAuthProvider() === "firebase" ? firebaseConfigured() : Boolean(API_URL);
}

function headers(accessToken?: string | null) {
  return {
    "Content-Type": "application/json",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

export function authConfigured() {
  return configured();
}

export function authChannelLabel() {
  return customerAuthProvider() === "firebase" ? "SMS" : "WhatsApp";
}

export function normalizeIndianPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  const local = digits.startsWith("91") && digits.length === 12 ? digits.slice(2) : digits;
  if (!/^[6-9]\d{9}$/.test(local)) throw new Error("Enter a valid 10-digit Indian mobile number");
  return `+91${local}`;
}

export function maskedPhone(value?: string | null) {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  const local = digits.slice(-10);
  return local.length === 10 ? `+91 ••••••${local.slice(-4)}` : value;
}

export function getStoredSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as StoredSession; } catch { return null; }
}

function saveSession(payload: any): StoredSession {
  const session: StoredSession = {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + Number(payload.expires_in ?? 3600) - 30,
    user: payload.user,
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  window.dispatchEvent(new CustomEvent("hidi-auth-updated"));
  return session;
}

function loadScript(src: string) {
  if (typeof document === "undefined") throw new Error("Customer sign-in is available in the browser only");
  return new Promise<void>((resolve, reject) => {
    if (src.includes("firebase-app-compat") && window.firebase) {
      resolve();
      return;
    }
    if (src.includes("firebase-auth-compat") && window.firebase?.auth) {
      resolve();
      return;
    }
    const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
    if (existing?.dataset.loaded === "true") {
      resolve();
      return;
    }
    const script = existing ?? document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.hidiFirebase = "true";
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    }, { once: true });
    script.addEventListener("error", () => reject(new Error("Unable to load Firebase sign-in")), { once: true });
    if (!existing) document.head.appendChild(script);
  });
}

async function firebaseAuth() {
  if (typeof window === "undefined") throw new Error("Customer sign-in is available in the browser only");
  if (!firebaseConfigured()) throw new Error("Firebase phone sign-in is not configured");
  if (!window.__hidiFirebaseScripts) {
    window.__hidiFirebaseScripts = loadScript(`https://www.gstatic.com/firebasejs/${FIREBASE_JS_VERSION}/firebase-app-compat.js`)
      .then(() => loadScript(`https://www.gstatic.com/firebasejs/${FIREBASE_JS_VERSION}/firebase-auth-compat.js`));
  }
  await window.__hidiFirebaseScripts;
  if (!window.firebase) throw new Error("Unable to load Firebase sign-in");
  if (!window.firebase.apps.length) window.firebase.initializeApp(FIREBASE_CONFIG);
  return window.firebase.auth();
}

async function firebaseRecaptchaVerifier() {
  if (typeof document === "undefined" || !window.firebase) throw new Error("Customer sign-in is available in the browser only");
  if (window.__hidiRecaptchaVerifier) return window.__hidiRecaptchaVerifier;
  let container = document.getElementById("hidi-firebase-recaptcha");
  if (!container) {
    container = document.createElement("div");
    container.id = "hidi-firebase-recaptcha";
    document.body.appendChild(container);
  }
  const verifier = new window.firebase.auth.RecaptchaVerifier(container, { size: "invisible" });
  await verifier.render();
  window.__hidiRecaptchaVerifier = verifier;
  return verifier;
}

function firebaseErrorMessage(error: unknown, fallback: string) {
  const code = typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : "";
  if (code.includes("invalid-phone-number")) return "Enter a valid 10-digit Indian mobile number";
  if (code.includes("invalid-verification-code")) return "That code is invalid or has expired";
  if (code.includes("code-expired")) return "That code is invalid or has expired";
  if (code.includes("too-many-requests") || code.includes("quota-exceeded")) return "Please wait before requesting another OTP";
  if (code.includes("captcha-check-failed") || code.includes("missing-app-credential")) {
    return "Complete the browser verification and try again";
  }
  return fallback;
}

export async function sendPhoneOtp(phone: string) {
  if (!API_URL) throw new Error("Customer sign-in is not configured");
  const normalizedPhone = normalizeIndianPhone(phone);
  if (customerAuthProvider() === "firebase") {
    try {
      const auth = await firebaseAuth();
      const verifier = await firebaseRecaptchaVerifier();
      pendingFirebaseConfirmation = await auth.signInWithPhoneNumber(normalizedPhone, verifier);
      pendingFirebasePhone = normalizedPhone;
      return normalizedPhone;
    } catch (error) {
      throw new Error(firebaseErrorMessage(error, "Unable to send the verification code"));
    }
  }
  const response = await fetch(`${API_URL}/auth/otp/request`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ phone: normalizedPhone }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message ?? "Unable to send the verification code");
  return String(data?.phone ?? normalizedPhone);
}

export async function verifyPhoneOtp(phone: string, token: string) {
  if (!API_URL) throw new Error("Customer sign-in is not configured");
  const normalizedPhone = normalizeIndianPhone(phone);
  if (customerAuthProvider() === "firebase") {
    if (!pendingFirebaseConfirmation || pendingFirebasePhone !== normalizedPhone) {
      throw new Error("Request a new OTP before verifying this code");
    }
    try {
      const auth = await firebaseAuth();
      const credential = await pendingFirebaseConfirmation.confirm(token.trim());
      const idToken = await credential.user.getIdToken(true);
      const response = await fetch(`${API_URL}/auth/otp/verify`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ provider: "firebase", idToken }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message ?? "That code is invalid or has expired");
      pendingFirebaseConfirmation = null;
      pendingFirebasePhone = null;
      await auth.signOut().catch(() => undefined);
      return saveSession(data);
    } catch (error) {
      throw new Error(firebaseErrorMessage(error, error instanceof Error ? error.message : "That code is invalid or has expired"));
    }
  }
  const response = await fetch(`${API_URL}/auth/otp/verify`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ phone: normalizedPhone, otp: token.trim() }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message ?? "That code is invalid or has expired");
  return saveSession(data);
}

export async function sendEmailOtp(email: string) {
  void email;
  throw new Error("Email OTP is not enabled for customer sign-in");
}

export async function verifyEmailOtp(email: string, token: string) {
  void email;
  void token;
  throw new Error("Email OTP is not enabled for customer sign-in");
}

async function refreshSession(session: StoredSession) {
  if (!API_URL) return null;
  function isCurrentSession() {
    const current = getStoredSession();
    return current?.user?.id === session.user.id && current?.refresh_token === session.refresh_token;
  }
  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  if (!response.ok) {
    if (isCurrentSession()) clearStoredSession();
    return null;
  }
  const payload = await response.json();
  if (!isCurrentSession() || payload?.user?.id !== session.user.id) return null;
  return saveSession(payload);
}

let pendingRefresh: {
  userId: string;
  refreshToken: string;
  promise: Promise<StoredSession | null>;
} | null = null;

export async function getAccessToken() {
  const session = getStoredSession();
  if (!session) return null;
  if (session.expires_at > Math.floor(Date.now() / 1000)) return session.access_token;
  // Account, wallet and navigation mount together. Share the token rotation so
  // every caller receives the same authenticated result instead of a stale null.
  if (!pendingRefresh || pendingRefresh.userId !== session.user.id || pendingRefresh.refreshToken !== session.refresh_token) {
    const promise = refreshSession(session).finally(() => {
      if (pendingRefresh?.promise === promise) pendingRefresh = null;
    });
    pendingRefresh = { userId: session.user.id, refreshToken: session.refresh_token, promise };
  }
  const refreshed = await pendingRefresh.promise;
  const current = getStoredSession();
  return refreshed && current?.user.id === session.user.id && current.access_token === refreshed.access_token
    ? refreshed.access_token
    : null;
}

export async function signOut() {
  const token = await getAccessToken();
  const session = getStoredSession();
  if (API_URL) {
    await fetch(`${API_URL}/auth/logout`, {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify({ refresh_token: session?.refresh_token ?? "" }),
    }).catch(() => undefined);
  }
  clearStoredSession();
}

export function clearStoredSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent("hidi-auth-updated"));
}
