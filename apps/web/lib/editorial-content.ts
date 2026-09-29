/** HIDI catalogue/campaign imagery, never presented as customer UGC. */
export type LookbookEntry = { id: string; title: string; edit: "Work" | "Everyday" | "Occasion"; image: string; alt: string; href: string; };
export type CommunityEntry = LookbookEntry & { credit: string; permissionConfirmed: true; approved: true; };
export const editorialLooks: LookbookEntry[] = [
  { id: "work-01", title: "A quieter kind of confidence", edit: "Work", image: "/products/ira-beige-office-kurta-set/02-alt.png", alt: "HIDI editorial styling in a neutral kurta set", href: "/products/ira-beige-office-kurta-set" },
  { id: "everyday-01", title: "Ease, from morning to evening", edit: "Everyday", image: "/products/myra-peach-comfort-kurta-set/02-alt.png", alt: "Peach kurta set in HIDI editorial photography", href: "/products/myra-peach-comfort-kurta-set" },
  { id: "occasion-01", title: "A little after-hours elegance", edit: "Occasion", image: "/products/kiara-wine-festive-kurta-set/02-alt.png", alt: "Wine-coloured HIDI occasion styling", href: "/products/kiara-wine-festive-kurta-set" },
  { id: "work-02", title: "The everyday work wardrobe", edit: "Work", image: "/products/nivya-olive-work-kurta/02-alt.png", alt: "Olive kurta in HIDI workwear editorial", href: "/products/nivya-olive-work-kurta" },
  { id: "everyday-02", title: "Room for a slower day", edit: "Everyday", image: "/products/rhea-mint-daily-kurta/02-alt.png", alt: "Mint everyday kurta in HIDI catalogue styling", href: "/products/rhea-mint-daily-kurta" },
  { id: "occasion-02", title: "An understated celebration", edit: "Occasion", image: "/products/anika-ivory-embroidered-set/02-alt.png", alt: "Ivory embroidered occasion set in HIDI editorial photography", href: "/products/anika-ivory-embroidered-set" },
];
// Only populate with HIDI-approved customer photos and explicit publishing permission.
export const communityLooks: CommunityEntry[] = [];
