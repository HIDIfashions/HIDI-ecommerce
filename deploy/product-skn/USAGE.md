# Import products and match photos by SKN

Each product gets one permanent five-digit SKN after it is saved. All its sizes
share that number. Existing size-level SKU codes continue to work for stock,
packing and price tags. Editing product details keeps the SKN.

1. Open **Admin → Tools → Bulk Product Details** and upload the product Excel
   workbook or CSV. Choose **NEW** for new products or **UPDATE** for existing
   products. Review the preview, category, colour, sizes and prices before saving.
2. Save the reviewed products, then download **SKN mapping CSV**. It contains the
   confirmed SKN, product name, colour, sizes and an example photo filename.
   The native **Bulk imports** result also shows each assigned SKN. You can
   download the full product SKN catalogue from **SKN Photo Upload**.
3. Name the photos using the saved SKN:

   | Filename | Purpose |
   | --- | --- |
   | `12345_001_main.webp` | First product photo |
   | `12345_002.jpeg` | Second gallery photo |
   | `12345_003.webp` | Third gallery photo |

4. Open **Admin → Tools → SKN Photo Upload**, select the photos and review every
   matched product. A product with several colours requires an explicit colour
   choice. The selected colour's sizes share the photos.
5. Start the upload. Unknown SKNs, duplicate photo numbers and more than one main
   photo for a product must be corrected before uploading. Interrupted uploads
   need verification before retrying.

JPEG, PNG, WebP and AVIF are supported, up to 12 MB per photo. Use `.webp`,
not `.wbep`. Original image bytes are uploaded without automatic compression.

## Wear categories and Ananya's Pick

Choose **Casual Wear**, **Work Wear** or **Occasional Wear** as the main category.
In the product bulk-import CSV, set `ananyas_pick` to `true` for selected products
or `false` to remove that selection. A labelled supplier sheet can use
`Subcategory: Ananya's Pick`. Review the selection before saving.

Ananya's Pick shows selected published products from all three wear categories.
A product can appear in both its wear category and Ananya's Pick. Existing
Everyday, Workwear Edit and Occasion links continue to work.

Five digits provide numbers from `10000` through `99999`. Numbers are never
reused, including after deletion; failed transactions can leave gaps. Do not
derive or guess a number from a product's name or price: use the downloaded
mapping or the saved product record.
