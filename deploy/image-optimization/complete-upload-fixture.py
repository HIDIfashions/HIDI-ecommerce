"""Complete the isolated API fixture contract; no application or cloud mutations."""
from pathlib import Path
p=Path('tests/photo-web-upload.browser.mjs');s=p.read_text()
pairs=[
("alt:'Upload fixture photograph',isMain:i===0", "alt:'Upload fixture photograph',position:i,isMain:i===0"),
("status:'ACTIVE',currency:'INR',pricePaise:199900", "status:'ACTIVE',inStock:true,currency:'INR',pricePaise:199900"),
(" if(path==='/products')return send([product()]);", " if(path==='/reviews/products/photo-fixture')return send({averageRating:0,reviewCount:0,verifiedReviewCount:0,ratingDistribution:{1:0,2:0,3:0,4:0,5:0},reviews:[]});\n if(path==='/products/photo-fixture/related')return send([]);\n if(path==='/products')return send([product()]);")]
for before,after in pairs:
 if before not in s and after in s:continue
 assert s.count(before)==1,'Unexpected fixture anchor: '+before
 s=s.replace(before,after,1)
p.write_text(s)
print('Isolated reviews, related products and image positions now match the production API shape.')
