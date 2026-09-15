import { ProductCard } from "@/components/product-card";
import { getProducts } from "@/lib/api";

export const dynamic = "force-dynamic";

const labels: Record<string, { title: string; copy: string }> = {
  "new-arrivals": { title: "New Arrivals", copy: "Fresh HIDI pieces, added in small considered edits." },
  "work-edit": { title: "Work Edit", copy: "Polished Indian wear for meetings, commutes and everything after." },
  everyday: { title: "Everyday", copy: "Easy silhouettes designed to earn their place in your weekly rotation." },
  occasion: { title: "Occasion", copy: "Elevated colour and detail, without the noise." },
};

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const collection = labels[slug] ?? labels["new-arrivals"];
  const products = await getProducts(slug);
  return <div className="container collection-page">
    <header className="collection-header"><p className="eyebrow">HIDI EDIT</p><h1>{collection.title}</h1><p>{collection.copy}</p></header>
    <div className="filter-bar"><span>{products.length} styles</span><div><button>Size</button><button>Colour</button><button>Price</button><button>Sort: Featured</button></div></div>
    <div className="product-grid">{products.map((product) => <ProductCard key={product.id} product={product} />)}</div>
  </div>;
}
