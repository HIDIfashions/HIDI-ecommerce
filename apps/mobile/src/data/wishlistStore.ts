import { localStore } from "../storage/localStore";

let mutationChain: Promise<void> = Promise.resolve();

export async function setWishlistDesired(slug: string, desired: boolean) {
  mutationChain = mutationChain.then(async () => {
    const current = await localStore.wishlist();
    const exists = current.includes(slug);
    if (exists === desired) return;
    const next = desired ? [...current, slug] : current.filter((item) => item !== slug);
    await localStore.setWishlist(next);
  }).catch(() => undefined);
  await mutationChain;
  return localStore.wishlist();
}
