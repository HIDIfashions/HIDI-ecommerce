/** Preserve a pasted +91 prefix, but keep only ten local digits in the visible field. */
export function localMobileDigits(value: string) {
  const digits = value.replace(/[^0-9]/g, "");
  const local = (value.trimStart().startsWith("+91") || digits.length === 12 && digits.startsWith("91"))
    ? digits.slice(2) : digits;
  return local.slice(0, 10);
}
export function validLocalMobile(value: string) { return /^[6-9][0-9]{9}$/.test(value); }
export function localOtpDigits(value: string) { return value.replace(/[^0-9]/g, "").slice(0, 6); }
export type PhoneProof = { phone: string; token: string; expiresAt: string };
export function proofMatches(proof: PhoneProof | null, phone: string, now = Date.now()) {
  return !!proof && proof.phone === phone && /^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/.test(proof.token)
    && Number.isFinite(Date.parse(proof.expiresAt)) && Date.parse(proof.expiresAt) > now;
}
