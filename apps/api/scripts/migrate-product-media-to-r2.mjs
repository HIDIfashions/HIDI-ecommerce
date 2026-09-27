import { createHash, createHmac } from "node:crypto";
import pg from "pg";

const DEFAULT_BUCKET = "hidi-product-media-prod";
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

function required(name, fallback = "") {
  const value = (process.env[name] ?? fallback).trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const config = {
  databaseUrl: required("DATABASE_URL"),
  accountId: required("R2_ACCOUNT_ID"),
  accessKeyId: required("R2_ACCESS_KEY_ID"),
  secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
  bucket: required("R2_BUCKET", DEFAULT_BUCKET),
  publicBaseUrl: required("R2_PUBLIC_BASE_URL").replace(/\/$/, ""),
  write: process.env.R2_MIGRATE_WRITE === "true",
};

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key, value) {
  return createHmac("sha256", key).update(value).digest();
}

function hmacHex(key, value) {
  return createHmac("sha256", key).update(value).digest("hex");
}

function amzTimestamp(date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function extensionFromContentType(contentType) {
  return ({
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif",
  })[contentType] ?? "jpg";
}

function signingKey(secretAccessKey, dateStamp) {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, "auto");
  const serviceKey = hmac(regionKey, "s3");
  return hmac(serviceKey, "aws4_request");
}

function encodeS3Path(bucket, key) {
  return `/${encodeURIComponent(bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function imageKey(row, contentType) {
  const tablePrefix = row.table_name === "ProductImage" ? "product-images" : "variant-images";
  return `products/migrated/${tablePrefix}/${row.id}/original.${extensionFromContentType(contentType)}`;
}

async function uploadToR2(key, body, contentType) {
  const payloadHash = sha256Hex(body);
  const now = new Date();
  const amzDate = amzTimestamp(now);
  const dateStamp = amzDate.slice(0, 8);
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = encodeS3Path(config.bucket, key);
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalHeaders = [
    `content-type:${contentType}`,
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
    "",
  ].join("\n");
  const canonicalRequest = ["PUT", canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256Hex(canonicalRequest)].join("\n");
  const signature = hmacHex(signingKey(config.secretAccessKey, dateStamp), stringToSign);
  const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(`https://${host}${canonicalUri}`, {
    method: "PUT",
    headers: {
      Authorization: authorization,
      "Content-Type": contentType,
      "X-Amz-Content-Sha256": payloadHash,
      "X-Amz-Date": amzDate,
    },
    body,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `R2 upload failed with HTTP ${response.status}`);
  }
}

async function fetchImage(row) {
  const response = await fetch(row.url);
  if (!response.ok) throw new Error(`download failed with HTTP ${response.status}`);

  const rawType = response.headers.get("content-type")?.split(";")[0]?.toLowerCase() ?? "";
  const contentType = IMAGE_TYPES.has(rawType) ? rawType : "image/jpeg";
  const body = Buffer.from(await response.arrayBuffer());
  if (!body.length) throw new Error("downloaded image is empty");
  return { body, contentType };
}

async function rowsToMigrate(client) {
  const { rows } = await client.query(
    `
      SELECT 'ProductImage' AS table_name, id, url, NULL::text AS storage_path
      FROM "ProductImage"
      WHERE url LIKE 'http%'
        AND url NOT LIKE $1
      UNION ALL
      SELECT 'ProductVariantImage' AS table_name, id, url, "storagePath" AS storage_path
      FROM "ProductVariantImage"
      WHERE url LIKE 'http%'
        AND url NOT LIKE $1
        AND COALESCE("storagePath", '') NOT LIKE 'r2://%'
      ORDER BY table_name, id
    `,
    [`${config.publicBaseUrl}%`],
  );
  return rows;
}

async function updateRow(client, row, url, storagePath) {
  if (row.table_name === "ProductImage") {
    await client.query(`UPDATE "ProductImage" SET url = $1 WHERE id = $2`, [url, row.id]);
    return;
  }
  await client.query(`UPDATE "ProductVariantImage" SET url = $1, "storagePath" = $2 WHERE id = $3`, [url, storagePath, row.id]);
}

async function main() {
  const client = new pg.Client({ connectionString: config.databaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    const rows = await rowsToMigrate(client);
    console.log(`${config.write ? "WRITE" : "DRY RUN"}: ${rows.length} product media rows need migration`);

    let migrated = 0;
    for (const row of rows) {
      try {
        const image = await fetchImage(row);
        const key = imageKey(row, image.contentType);
        const nextUrl = `${config.publicBaseUrl}/${key}`;
        const storagePath = `r2://${config.bucket}/${key}`;

        console.log(`${config.write ? "migrating" : "would migrate"} ${row.table_name}:${row.id} -> ${nextUrl}`);
        if (config.write) {
          await uploadToR2(key, image.body, image.contentType);
          await updateRow(client, row, nextUrl, storagePath);
        }
        migrated += 1;
      } catch (error) {
        console.error(`failed ${row.table_name}:${row.id} ${row.url}`);
        console.error(error instanceof Error ? error.message : error);
      }
    }

    console.log(`${config.write ? "Migrated" : "Dry run checked"} ${migrated}/${rows.length} rows`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
