"""Build the deterministic starter ZIP; do not embed sample product rows/photos."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

HERE = Path(__file__).resolve().parent
README = """HIDI — PRODUCT DETAILS AND PHOTOS IN ONE PACKAGE

1. Extract this starter ZIP into a folder on your computer.
2. Fill the Products sheet of HIDI_Product_Upload_Template.xlsx.
   All supported product fields are in the template's Field guide.
   Use one row per colour and size. Leave Examples unchanged: it is never imported.
3. Enter a unique image_sku for each product colour, e.g. KUR_001_IVORY.
4. Create photos/KUR_001_IVORY/ and place that colour's pictures there.
   Each size of that colour uses the same image_sku and photos.
   Keep original camera filenames: DSC00137.jpg, DSC00143.jpg, etc.
   Different product folders can contain the same camera filenames.
5. Leave photo_names blank to include all pictures in the colour folder,
   in filename order. Or enter exact filenames separated by semicolons
   to set the order, e.g. DSC00143.jpg;DSC00137.jpg.
   For a new or empty gallery, main_photo can select the preferred cover.
   For an existing gallery, leave main_photo blank to keep its current cover.
6. Select the completed Excel file and photos folder and compress them together
   into one ZIP (Windows: Send to > Compressed folder; Mac: Compress items).
   Do not include the original starter ZIP or another spreadsheet in it.
7. In HIDI Admin > Product Upload, choose the ZIP once, review all product details
   and original photo paths, then Save as draft or Publish to storefront.

Example package contents:
HIDI_Product_Upload_Template.xlsx
photos/KUR_001_IVORY/DSC00137.jpg
photos/KUR_001_IVORY/DSC00143.jpg
photos/COR_003_ORANGE/DSC00137.jpg

Limits: one XLSX/CSV; up to 1,000 JPEG, PNG, WebP or AVIF images;
each photo <= 12 MiB; ZIP and expanded contents <= 512 MiB.
Export ARW/RAW camera photos to JPEG first; renaming the extension is not conversion.
Existing stock is retained. New variants start at zero: use Receive Stock.
UPDATE requires the exact product ID, SKN or existing product slug.
Updating a published product temporarily hides it until publication completes;
Save as draft leaves it hidden. Review the confirmation before saving.
Old separately selected Excel/photos and numbered-photo packages are also supported.
The template's separate-selection instructions refer to that optional older method.
"""

def build():
    entries = {
        'HIDI_Product_Upload_Template.xlsx': (HERE / 'HIDI_Product_Upload_Template.xlsx').read_bytes(),
        'README.txt': README.encode('utf-8'),
        'photos/': b'',
    }
    destination = HERE / 'HIDI_Product_Upload_Package.zip'
    with ZipFile(destination, 'w', compression=ZIP_DEFLATED, compresslevel=6) as archive:
        for name, data in entries.items():
            info = ZipInfo(name, (2026, 10, 13, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.external_attr = (0o40755 if name.endswith('/') else 0o100644) << 16
            archive.writestr(info, data)
    return destination

if __name__ == '__main__':
    print(build().name)
