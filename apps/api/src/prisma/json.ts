// Prisma's SQL Server connector stores JSON as nvarchar(max).
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export function encodeJson(value: unknown): string {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new TypeError("JSON value is required");
  return encoded;
}
export function decodeJson(value: unknown): any {
  if (typeof value !== "string") return value;
  return JSON.parse(value);
}
