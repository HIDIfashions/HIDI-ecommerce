import { screenRegistry } from "../src/spec/screenRegistry";
import { canSubmitSupportDraft, makeLocalSupportTicket, normalizeOptionalEmail, phase5Capabilities, safeGuestOrderLookup } from "../src/models/account";

describe("Phase 5 account support and privacy contracts", () => {
  it("keeps all Phase 5 P0 screens in the registry", () => {
    const phase5 = screenRegistry.filter((screen) => screen.phase === 5);
    expect(phase5.map((screen) => screen.id)).toEqual([
      ...Array.from({ length: 20 }, (_, index) => "H" + String(index + 83).padStart(3, "0")),
      "H123", "H124", "H125", "H126", "H132",
    ]);
    expect(phase5.every((screen) => screen.priority === "P0")).toBe(true);
  });

  it("validates optional email without inventing identity ownership", () => {
    expect(normalizeOptionalEmail(" USER@Example.COM ")).toBe("user@example.com");
    expect(normalizeOptionalEmail("   ")).toBeNull();
    expect(() => normalizeOptionalEmail("bad-address")).toThrow("valid email");
  });

  it("uses generic guest order lookup responses that do not leak existence", () => {
    const result = safeGuestOrderLookup("HIDI-1001", "customer@example.com");
    expect(result.accepted).toBe(true);
    expect(result.message.toLowerCase()).toContain("does not confirm");
  });

  it("creates idempotent local support references when server support is unavailable", () => {
    const ticket = makeLocalSupportTicket({
      operationId: "support-demo-123",
      topic: "Delivery",
      subject: " Need help with delivery ",
      body: "The parcel has not moved for several days and I need help.",
      contactPreference: "email",
      orderNumber: "HIDI1001",
    });
    expect(ticket.caseId).toBe("LOCAL-TDEMO123");
    expect(ticket.status).toBe("local_draft");
    expect(canSubmitSupportDraft(ticket.subject, ticket.body)).toBe(true);
  });

  it("does not pretend unavailable account APIs are supported", () => {
    expect(phase5Capabilities.supportTicketsApi).toBe("unavailable");
    expect(phase5Capabilities.privacyExportApi).toBe("unavailable");
    expect(phase5Capabilities.privacyDeletionApi).toBe("unavailable");
    expect(phase5Capabilities.paymentMethodTokens).toBe("unavailable");
    expect(phase5Capabilities.addressBook).toBe("local-device-only");
  });
});
