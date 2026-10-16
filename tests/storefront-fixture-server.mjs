// Isolated synthetic catalogue for local UI verification; never used by the app.
import { createServer } from "node:http";
const slugs = ["aara-sage-work-kurta", "mahira-indigo-kurta-set", "sana-sand-kurta-set", "kiara-wine-festive-kurta-set"];
const products = slugs.map((slug, i) => ({
  id: "test-product-" + i, slug,
  name: slug.split("-").map(w => w[0].toUpperCase() + w.slice(1)).join(" "),
  shortDescription: "Local test catalogue · Not a live product",
  description: "Synthetic product for checking shopping interactions.",
  fabric: "See garment label", care: "Follow the garment care label.",
  category: {id:"test-category",slug:"kurtas",name:"Kurtas"},
  collections: [{id:"test-collection",slug:"new-arrivals",name:"New Arrivals"}],
  images: ["01-main", "02-alt", "03-detail"].map((file,j) => ({id:slug+file,url:"/products/"+slug+"/"+file+".png",alt:slug+" view "+(j+1),position:j})),
  variants: ["Sage","Ivory"].flatMap((color,ci) => ["M","L","XL"].map((size,si) => ({
    id:slug+"-"+ci+"-"+si,sku:"TEST-"+i+"-"+ci+"-"+si,color,size,
    pricePaise:129000+ci*10000,mrpPaise:159000,available:si===2 ? 0 : 3
  }))),
  minPricePaise:129000,maxPricePaise:139000,inStock:true
}));
createServer((req,res) => {
  res.setHeader("Access-Control-Allow-Origin","http://localhost:3100");
  res.setHeader("Content-Type","application/json");
  const path = new URL(req.url,"http://localhost").pathname;
  if(path==="/v1/products") return res.end(JSON.stringify(products));
  if(path.startsWith("/v1/products/")) {
    const product=products.find(p=>p.slug===decodeURIComponent(path.split("/").pop()));
    res.statusCode=product?200:404;return res.end(JSON.stringify(product??{}));
  }
  if(path.startsWith("/v1/reviews/products/")) return res.end(JSON.stringify({averageRating:0,reviewCount:0,reviews:[]}));
  if(path.startsWith("/v1/carts/")) return res.end(JSON.stringify({items:[],itemCount:0,totalPaise:0}));
  res.statusCode=404;res.end(JSON.stringify({message:"Test endpoint not available"}));
}).listen(4100,"127.0.0.1",()=>console.log("Synthetic catalogue on http://127.0.0.1:4100"));
