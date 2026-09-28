/** HIDI catalogue/campaign imagery, never presented as customer UGC. */
export type LookbookEntry = { id: string; title: string; edit: "Work" | "Everyday" | "Occasion"; image: string; alt: string; href: string; };
export type CommunityEntry = LookbookEntry & { credit: string; permissionConfirmed: true; approved: true; };
export const editorialLooks: LookbookEntry[] = [
  { id: "work-01", title: "A quieter kind of confidence", edit: "Work", image: "/products/ira-beige-office-kurta-set/01-main.png", alt: "HIDI editorial styling in a neutral kurta set", href: "/collections/work-edit" },
  { id: "everyday-01", title: "Ease, from morning to evening", edit: "Everyday", image: "/products/myra-peach-comfort-kurta-set/01-main.png", alt: "Peach kurta set in HIDI editorial photography", href: "/collections/everyday" },
  { id: "occasion-01", title: "A little after-hours elegance", edit: "Occasion", image: "/products/kiara-wine-festive-kurta-set/01-main.png", alt: "Wine-coloured HIDI occasion styling", href: "/collections/occasion" },
  { id: "work-02", title: "The everyday work wardrobe", edit: "Work", image: "/products/nivya-olive-work-kurta/01-main.png", alt: "Olive kurta in HIDI workwear editorial", href: "/collections/work-edit" },
  { id: "everyday-02", title: "Room for a slower day", edit: "Everyday", image: "/products/rhea-mint-daily-kurta/01-main.png", alt: "Mint everyday kurta in HIDI catalogue styling", href: "/collections/everyday" },
  { id: "occasion-02", title: "An understated celebration", edit: "Occasion", image: "/products/anika-ivory-embroidered-set/01-main.png", alt: "Ivory embroidered occasion set in HIDI editorial photography", href: "/collections/occasion" },
];
// Only populate with HIDI-approved customer photos and explicit publishing permission.
export const communityLooks: CommunityEntry[] = [];
