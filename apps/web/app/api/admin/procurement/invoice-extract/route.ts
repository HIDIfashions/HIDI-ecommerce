import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";

const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED = new Set(["application/pdf", "image/jpeg", "image/png"]);
const OPENAI_URL = "https://api.openai.com/v1/responses";

function extractionSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      vendorName: { anyOf: [{ type: "string" }, { type: "null" }] },
      vendorGstin: { anyOf: [{ type: "string" }, { type: "null" }] },
      invoiceNumber: { anyOf: [{ type: "string" }, { type: "null" }] },
      invoiceDate: { anyOf: [{ type: "string" }, { type: "null" }] },
      subtotalRupees: { anyOf: [{ type: "number" }, { type: "null" }] },
      taxRupees: { anyOf: [{ type: "number" }, { type: "null" }] },
      totalRupees: { anyOf: [{ type: "number" }, { type: "null" }] },
      lines: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            rawDescription: { type: "string" },
            vendorStyleCode: { anyOf: [{ type: "string" }, { type: "null" }] },
            hsn: { anyOf: [{ type: "string" }, { type: "null" }] },
            quantity: { anyOf: [{ type: "integer" }, { type: "null" }] },
            unitCostRupees: { anyOf: [{ type: "number" }, { type: "null" }] },
            amountRupees: { anyOf: [{ type: "number" }, { type: "null" }] },
          },
          required: ["rawDescription", "vendorStyleCode", "hsn", "quantity", "unitCostRupees", "amountRupees"],
        },
      },
      warnings: { type: "array", items: { type: "string" } },
    },
    required: [
      "vendorName",
      "vendorGstin",
      "invoiceNumber",
      "invoiceDate",
      "subtotalRupees",
      "taxRupees",
      "totalRupees",
      "lines",
      "warnings",
    ],
  };
}

function outputText(body: any) {
  for (const item of body?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (content?.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return "";
}

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Admin session expired" }, { status: 401 });

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { message: "OPENAI_API_KEY is not configured on the HIDI web server. Invoice file reading is unavailable." },
      { status: 503 },
    );
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ message: "Choose a PDF, JPEG or PNG vendor invoice" }, { status: 400 });
  if (!ALLOWED.has(file.type)) return NextResponse.json({ message: "Use PDF, JPEG or PNG for vendor invoices" }, { status: 400 });
  if (file.size < 1 || file.size > MAX_BYTES) return NextResponse.json({ message: "Invoice file must be between 1 byte and 12 MB" }, { status: 400 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const dataUrl = `data:${file.type};base64,${bytes.toString("base64")}`;
  const documentPart = file.type === "application/pdf"
    ? { type: "input_file", filename: file.name || "invoice.pdf", file_data: dataUrl }
    : { type: "input_image", image_url: dataUrl, detail: "high" };

  const prompt = [
    "Extract purchasing facts from this Indian garment vendor invoice.",
    "Do not invent data. If a field is absent or ambiguous, return null and explain it in warnings.",
    "For each merchandise line extract the vendor's dress/material/style code exactly when identifiable.",
    "Extract the line TOTAL garment quantity printed on the invoice.",
    "Do NOT return or infer a size split. HIDI staff enters M/L/XL/XXL/etc quantities manually later.",
    "If no total quantity is printed but explicit size-column quantities are clearly present, you may sum them to obtain the line total and add a warning saying the total was derived.",
    "Ignore GST summary rows, freight, round-off and payment rows as merchandise lines.",
    "invoiceDate should be YYYY-MM-DD when confidently readable, otherwise null.",
    "All monetary values must be rupees, not paise.",
  ].join("\n");

  try {
    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_INVOICE_MODEL?.trim() || "gpt-5.6-luna",
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            documentPart,
          ],
        }],
        text: {
          format: {
            type: "json_schema",
            name: "hidi_vendor_invoice",
            strict: true,
            schema: extractionSchema(),
          },
        },
      }),
      signal: AbortSignal.timeout(90_000),
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      return NextResponse.json(
        { message: body?.error?.message ?? "Invoice extraction service rejected the document" },
        { status: response.status >= 400 && response.status < 500 ? response.status : 502 },
      );
    }

    const raw = outputText(body);
    if (!raw) return NextResponse.json({ message: "Invoice extraction returned no structured data" }, { status: 502 });

    const extracted = JSON.parse(raw);
    return NextResponse.json({
      ...extracted,
      originalFilename: file.name,
      mimeType: file.type,
      fileSize: file.size,
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to read vendor invoice" },
      { status: 502 },
    );
  }
}
