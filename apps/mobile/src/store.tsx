import React, { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import type { Address, AuthSession, Campaign, Cart, Product } from "./domain";
import { commerceApi } from "./api";
import { storage } from "./storage";

type LoadState = "loading" | "ready" | "offline" | "error";
type Store = {
  products: Product[]; catalogState: LoadState; catalogError: string; campaign: Campaign | null;
  cart: Cart | null; cartBusy: boolean; cartError: string; wishlist: string[]; addresses: Address[];
  auth: AuthSession | null; refreshCatalog: () => Promise<void>; product: (slug: string) => Product | undefined;
  toggleWishlist: (slug: string) => Promise<void>; addToBag: (variantId: string, quantity?: number) => Promise<Cart>;
  updateQuantity: (lineId: string, quantity: number) => Promise<void>; removeLine: (lineId: string) => Promise<void>;
  saveAddress: (address: Address) => Promise<void>; removeAddress: (id: string) => Promise<void>;
  setAuth: (session: AuthSession | null) => Promise<void>; refreshCart: () => Promise<void>;
};
const Context = createContext<Store | null>(null);

export function CommerceProvider({ children }: PropsWithChildren) {
  const [products, setProducts] = useState<Product[]>([]); const [catalogState, setCatalogState] = useState<LoadState>("loading"); const [catalogError, setCatalogError] = useState("");
  const [campaign, setCampaign] = useState<Campaign | null>(null); const [cart, setCart] = useState<Cart | null>(null); const [cartBusy, setCartBusy] = useState(false); const [cartError, setCartError] = useState("");
  const [wishlist, setWishlist] = useState<string[]>([]); const [addresses, setAddresses] = useState<Address[]>([]); const [auth, setAuthState] = useState<AuthSession | null>(null);
  const mutation = useRef(Promise.resolve());

  const refreshCatalog = useCallback(async () => {
    setCatalogError(""); setCatalogState(current => products.length ? current : "loading");
    try { const next = await commerceApi.products(); setProducts(next); setCatalogState("ready"); await storage.saveCatalog(next); }
    catch (error) { const cache = await storage.catalog(); if (cache?.products?.length) { setProducts(cache.products); setCatalogState("offline"); } else { setCatalogState("error"); setCatalogError(error instanceof Error ? error.message : "Catalogue unavailable."); } }
  }, [products.length]);
  const refreshCart = useCallback(async () => { try { const id = await storage.sessionId(); setCart(await commerceApi.cart(id)); setCartError(""); } catch (error) { setCartError(error instanceof Error ? error.message : "Bag unavailable."); } }, []);
  useEffect(() => { void Promise.all([refreshCatalog(), refreshCart(), storage.wishlist().then(setWishlist), storage.addresses().then(setAddresses), storage.auth().then(setAuthState)]); void commerceApi.campaign().then(setCampaign).catch(() => undefined); }, [refreshCart, refreshCatalog]);
  useEffect(() => { const sub = NetInfo.addEventListener(state => { if (state.isConnected && catalogState === "offline") void refreshCatalog(); }); return () => sub(); }, [catalogState, refreshCatalog]);

  async function toggleWishlist(slug: string) { const next = wishlist.includes(slug) ? wishlist.filter(x => x !== slug) : [...wishlist, slug]; setWishlist(next); await storage.saveWishlist(next); }
  function runCart<T>(work: () => Promise<T>) { const next = mutation.current.then(work, work); mutation.current = next.then(() => undefined, () => undefined); return next; }
  async function addToBag(variantId: string, quantity = 1) { return runCart(async () => { setCartBusy(true); setCartError(""); try { const id = await storage.sessionId(); const next = await commerceApi.addCart(id, variantId, quantity); setCart(next); return next; } catch (error) { setCartError(error instanceof Error ? error.message : "Could not add to bag."); throw error; } finally { setCartBusy(false); } }); }
  async function updateQuantity(lineId: string, quantity: number) { await runCart(async () => { setCartBusy(true); try { const id = await storage.sessionId(); setCart(await commerceApi.updateCart(id, lineId, quantity)); } finally { setCartBusy(false); } }); }
  async function removeLine(lineId: string) { await runCart(async () => { setCartBusy(true); try { const id = await storage.sessionId(); setCart(await commerceApi.removeCart(id, lineId)); } finally { setCartBusy(false); } }); }
  async function saveAddress(address: Address) { const next = [address, ...addresses.filter(x => x.id !== address.id)].map((item, index) => ({ ...item, isDefault: address.isDefault ? index === 0 : item.isDefault })); setAddresses(next); await storage.saveAddresses(next); }
  async function removeAddress(id: string) { const next = addresses.filter(x => x.id !== id); setAddresses(next); await storage.saveAddresses(next); }
  async function setAuth(session: AuthSession | null) { setAuthState(session); if (session) await storage.saveAuth(session); else await storage.clearAuth(); }
  const value = useMemo<Store>(() => ({ products, catalogState, catalogError, campaign, cart, cartBusy, cartError, wishlist, addresses, auth, refreshCatalog, product: slug => products.find(x => x.slug === slug), toggleWishlist, addToBag, updateQuantity, removeLine, saveAddress, removeAddress, setAuth, refreshCart }), [products, catalogState, catalogError, campaign, cart, cartBusy, cartError, wishlist, addresses, auth, refreshCatalog, refreshCart]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useCommerce() { const value = useContext(Context); if (!value) throw new Error("useCommerce must be inside CommerceProvider"); return value; }
