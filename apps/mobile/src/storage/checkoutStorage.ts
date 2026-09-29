import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CheckoutAddress, CheckoutAttempt, CheckoutContact, DeliverySelection } from "../models/checkout";
import { makeCheckoutToken } from "../models/checkout";

const keys = {
  token: "hidi.mobile.checkoutToken.v1",
  contact: "hidi.mobile.checkoutContact.v1",
  addresses: "hidi.mobile.checkoutAddresses.v1",
  selectedAddress: "hidi.mobile.selectedAddress.v1",
  delivery: "hidi.mobile.deliverySelection.v1",
  attempt: "hidi.mobile.checkoutAttempt.v1",
};

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

async function writeJson(key: string, value: unknown) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export const checkoutStorage = {
  async checkoutToken() {
    const existing = await AsyncStorage.getItem(keys.token).catch(() => null);
    if (existing && existing.length >= 8) return existing;
    const next = makeCheckoutToken();
    await AsyncStorage.setItem(keys.token, next).catch(() => undefined);
    return next;
  },

  async resetCheckoutToken() {
    const next = makeCheckoutToken();
    await AsyncStorage.setItem(keys.token, next).catch(() => undefined);
    await AsyncStorage.removeItem(keys.attempt).catch(() => undefined);
    return next;
  },

  contact: () => readJson<CheckoutContact | null>(keys.contact, null),
  saveContact: (contact: CheckoutContact) => writeJson(keys.contact, contact),

  addresses: () => readJson<CheckoutAddress[]>(keys.addresses, []),

  async upsertAddress(address: CheckoutAddress) {
    const current = await this.addresses();
    const normalized = address.isDefault
      ? [address, ...current.filter((item) => item.id !== address.id).map((item) => ({ ...item, isDefault: false }))]
      : [address, ...current.filter((item) => item.id !== address.id)];
    await writeJson(keys.addresses, normalized);
    await this.selectAddress(address.id);
    return normalized;
  },

  selectedAddressId: () => AsyncStorage.getItem(keys.selectedAddress).catch(() => null),
  selectAddress: (id: string) => AsyncStorage.setItem(keys.selectedAddress, id).catch(() => undefined),

  async selectedAddress() {
    const [items, selectedId] = await Promise.all([this.addresses(), this.selectedAddressId()]);
    return items.find((item) => item.id === selectedId) ?? items.find((item) => item.isDefault) ?? items[0] ?? null;
  },

  delivery: () => readJson<DeliverySelection | null>(keys.delivery, null),
  saveDelivery: (delivery: DeliverySelection) => writeJson(keys.delivery, delivery),
  clearDelivery: () => AsyncStorage.removeItem(keys.delivery).catch(() => undefined),

  attempt: () => readJson<CheckoutAttempt | null>(keys.attempt, null),
  saveAttempt: (attempt: CheckoutAttempt) => writeJson(keys.attempt, attempt),
  clearAttempt: () => AsyncStorage.removeItem(keys.attempt).catch(() => undefined),

  async clearAfterOrder() {
    await Promise.all([
      AsyncStorage.removeItem(keys.token).catch(() => undefined),
      AsyncStorage.removeItem(keys.delivery).catch(() => undefined),
      AsyncStorage.removeItem(keys.attempt).catch(() => undefined),
    ]);
  },
};
