import { localStore, WishlistSnapshot } from "../storage/localStore";

let mutationChain: Promise<void> = Promise.resolve();

export async function setWishlistDesired(
  slug: string,
  desired: boolean,
  snapshot?: Omit<WishlistSnapshot, "savedAt">,
) {
  mutationChain = mutationChain.then(async () => {
    const current = await localStore.wishlist();
    const exists = current.includes(slug);
    if (exists === desired) return;

    if (desired) {
      await localStore.setWishlist([...current, slug]);
      if (snapshot) {
        await localStore.setWishlistSnapshot(slug, { ...snapshot, savedAt: Date.now() });
      }
    } else {
      await localStore.setWishlist(current.filter((item) => item !== slug));
      await localStore.removeWishlistSnapshot(slug);
    }
  }).catch(() => undefined);

  await mutationChain;
  return localStore.wishlist();
}
