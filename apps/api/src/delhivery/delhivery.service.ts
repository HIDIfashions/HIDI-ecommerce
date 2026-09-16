import { BadGatewayException, BadRequestException, Injectable } from "@nestjs/common";

type ServiceabilityResult = {
  pin: string;
  prepaid: boolean;
  cod: boolean;
  pickup: boolean;
  remarks?: string;
  city?: string;
  district?: string;
  stateCode?: string;
  raw: unknown;
};

type ManifestInput = {
  orderNumber: string;
  customerName: string;
  phone: string;
  address: string;
  city?: string;
  state?: string;
  pin: string;
  country?: string;
  productDescription: string;
  quantity: number;
  weightGrams: number;
  totalAmountRupees: number;
  paymentMode?: "Pre-paid" | "COD";
};

type ManifestResult = {
  waybill: string;
  status?: string;
  remarks?: string | null;
  raw: unknown;
};

@Injectable()
export class DelhiveryService {
  private baseUrl() {
    return (process.env.DELHIVERY_BASE_URL || "https://staging-express.delhivery.com").replace(/\/$/, "");
  }

  private token() {
    return (process.env.DELHIVERY_API_TOKEN || "").trim();
  }

  private clientName() {
    return (process.env.DELHIVERY_CLIENT_NAME || "").trim();
  }

  private pickupLocation() {
    return (process.env.DELHIVERY_PICKUP_LOCATION || "").trim();
  }

  private sellerGstin() {
    return (process.env.DELHIVERY_SELLER_GSTIN || "").trim();
  }

  private hsnCode() {
    return (process.env.DELHIVERY_DEFAULT_HSN_CODE || "").trim();
  }

  private assertBaseConfig() {
    const missing: string[] = [];
    if (!this.token()) missing.push("DELHIVERY_API_TOKEN");
    if (!this.clientName()) missing.push("DELHIVERY_CLIENT_NAME");
    if (!this.pickupLocation()) missing.push("DELHIVERY_PICKUP_LOCATION");

    if (missing.length) {
      throw new BadRequestException(`Missing Delhivery configuration: ${missing.join(", ")}`);
    }
  }

  private assertManifestConfig() {
    this.assertBaseConfig();
    const missing: string[] = [];
    if (!this.sellerGstin()) missing.push("DELHIVERY_SELLER_GSTIN");
    if (!this.hsnCode()) missing.push("DELHIVERY_DEFAULT_HSN_CODE");
    if (missing.length) {
      throw new BadRequestException(`Missing Delhivery shipment configuration: ${missing.join(", ")}`);
    }
  }

  private headers(extra?: Record<string, string>) {
    return {
      Authorization: `Token ${this.token()}`,
      Accept: "application/json",
      ...extra,
    };
  }

  async checkServiceability(pin: string): Promise<ServiceabilityResult> {
    this.assertBaseConfig();

    if (!/^\d{6}$/.test(pin)) {
      throw new BadRequestException("Delhivery serviceability requires a valid 6-digit PIN code");
    }

    const url = `${this.baseUrl()}/c/api/pin-codes/json/?filter_codes=${encodeURIComponent(pin)}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: this.headers({ "Content-Type": "application/json" }),
      });
    } catch {
      throw new BadGatewayException("Unable to connect to Delhivery staging API");
    }

    const body = await response.json().catch(() => null) as any;
    if (!response.ok) {
      throw new BadGatewayException(body?.detail || body?.error || body?.message || `Delhivery returned HTTP ${response.status}`);
    }

    const postal = body?.delivery_codes?.[0]?.postal_code;
    if (!postal) {
      return {
        pin,
        prepaid: false,
        cod: false,
        pickup: false,
        remarks: "No serviceability record returned",
        raw: body,
      };
    }

    return {
      pin,
      prepaid: String(postal.pre_paid ?? "").toUpperCase() === "Y",
      cod: String(postal.cod ?? postal.cash ?? "").toUpperCase() === "Y",
      pickup: String(postal.pickup ?? "").toUpperCase() === "Y",
      remarks: postal.remarks ?? "",
      city: postal.city,
      district: postal.district,
      stateCode: postal.state_code,
      raw: body,
    };
  }

  async createForwardShipment(input: ManifestInput): Promise<ManifestResult> {
    this.assertManifestConfig();

    const serviceability = await this.checkServiceability(input.pin);
    const paymentMode = input.paymentMode ?? "Pre-paid";
    const serviceable = paymentMode === "COD" ? serviceability.cod : serviceability.prepaid;

    if (!serviceable) {
      throw new BadRequestException(`PIN ${input.pin} is not serviceable for ${paymentMode} shipments in Delhivery staging`);
    }

    const shipment = {
      name: input.customerName,
      add: input.address,
      pin: input.pin,
      city: input.city || serviceability.city || "",
      state: input.state || "",
      country: input.country || "India",
      phone: input.phone,
      order: input.orderNumber.slice(0, 50),
      payment_mode: paymentMode,
      products_desc: input.productDescription,
      hsn_code: this.hsnCode(),
      total_amount: input.totalAmountRupees,
      cod_amount: paymentMode === "COD" ? input.totalAmountRupees : 0,
      quantity: input.quantity,
      weight: input.weightGrams,
      waybill: "",
      seller_gst_tin: this.sellerGstin(),
      seller_inv: input.orderNumber,
      invoice_reference: input.orderNumber,
      client: this.clientName(),
    };

    const payload = {
      shipments: [shipment],
      pickup_location: { name: this.pickupLocation() },
    };

    const form = new URLSearchParams();
    form.set("format", "json");
    form.set("data", JSON.stringify(payload));

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl()}/api/cmu/create.json`, {
        method: "POST",
        headers: this.headers({ "Content-Type": "application/x-www-form-urlencoded" }),
        body: form.toString(),
      });
    } catch {
      throw new BadGatewayException("Unable to connect to Delhivery shipment creation API");
    }

    const body = await response.json().catch(async () => ({ raw: await response.text().catch(() => "") })) as any;
    if (!response.ok) {
      throw new BadGatewayException(body?.rmk || body?.detail || body?.error || body?.message || `Delhivery returned HTTP ${response.status}`);
    }

    const pkg = body?.packages?.[0] ?? body?.package ?? body;
    const waybill = String(pkg?.waybill ?? pkg?.awb ?? pkg?.AWB ?? body?.waybill ?? "").trim();
    const status = pkg?.status ?? pkg?.Status ?? body?.status;
    const remarks = pkg?.remarks ?? pkg?.remark ?? body?.rmk ?? null;

    if (!waybill) {
      throw new BadGatewayException(remarks || "Delhivery did not return an AWB. Check the test client name, warehouse and staging token.");
    }

    if (status && String(status).toLowerCase() === "failed") {
      throw new BadGatewayException(remarks || "Delhivery rejected the shipment");
    }

    return { waybill, status, remarks, raw: body };
  }

  async track(waybill: string) {
    this.assertBaseConfig();
    if (!waybill.trim()) throw new BadRequestException("AWB is required");

    const url = `${this.baseUrl()}/api/v1/packages/json/?waybill=${encodeURIComponent(waybill.trim())}`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: this.headers({ "Content-Type": "application/json" }),
      });
    } catch {
      throw new BadGatewayException("Unable to connect to Delhivery tracking API");
    }

    const body = await response.json().catch(() => null) as any;
    if (!response.ok) {
      throw new BadGatewayException(body?.detail || body?.error || body?.message || `Delhivery returned HTTP ${response.status}`);
    }

    const shipment = body?.ShipmentData?.[0]?.Shipment ?? null;
    return {
      waybill,
      status: shipment?.Status?.Status ?? null,
      statusDateTime: shipment?.Status?.StatusDateTime ?? null,
      statusLocation: shipment?.Status?.StatusLocation ?? null,
      instructions: shipment?.Status?.Instructions ?? null,
      raw: body,
    };
  }

  publicTrackingUrl(waybill: string) {
    return `https://www.delhivery.com/tracking?uniqueIdentifier=${encodeURIComponent(waybill)}`;
  }
}
