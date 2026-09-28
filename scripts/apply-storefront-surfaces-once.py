"""One-time, hash-guarded source integration. This helper is removed after use."""
from pathlib import Path
import hashlib
import re

EXPECTED = {'apps/web/app/about/about.module.css': ['5081f6816487f5b85f2e9733991fda66f0a438ea', 'ea1764ddde914b00690f411de9ee9802a00f403e'], 'apps/web/app/home.module.css': ['d27f6bad106fef8e79c3514ec13d92e6ffda19c8', 'a6793650e0096f34ea6ed8048f15795bda20ad2d'], 'apps/web/app/layout.tsx': ['1e1752dcbb2376e222748243dfb5cbbbe839581f', 'b454e49458565535486fa1b6441c5c9388b406e6'], 'apps/web/app/review/[token]/review.module.css': ['9475377590c76b0d877ecb8abd7d7c633fb9f7b7', 'dbf1ae5844eabc05ed22f84710c1c197ef646880'], 'apps/web/components/account-orders.module.css': ['63822fd87b9a80a806bc7a4e4638804ffedf09c1', '039a4ab8f827e8e9e6dcec735a1d2cbc55c759fa'], 'apps/web/components/account/account-aftercare.module.css': ['7225724423dfa2a67b52cd325d15eca834115a27', '59a5bf0bc32f74013bbd805c8c3884ba11d302bd'], 'apps/web/components/account/account-order-detail.module.css': ['d3f291c44ab13ab94315b59a6b7684b2b325edb2', '0eba79151da8ab3a142d18d0ea9d434ca0423850'], 'apps/web/components/account/account-review-prompt.module.css': ['1b0edbd1ca64c1b8b6a38618b0fdcb4ab564fe51', 'd2f913a022f2860e4fa81bdf67b1643a287aa05d'], 'apps/web/components/account/account-shell.module.css': ['f47159a784b1a2884fdaad8ee61d9b240c9663b6', '9a4a3a098a846fd9842ebc1ac7e69dcac6c6eed1'], 'apps/web/components/add-to-cart.module.css': ['5a0e9b4a8a8bf1cfdf2be7f018694d9612acc4a0', '72989131be781db581c747fdf1dd0ac24b1eb32f'], 'apps/web/components/cart-client.tsx': ['f36e2d7d5df32cd78cae845c98e0bad0c6bf1b1b', 'bb5f640eba41aed8e519c4e6fb4a508229765901'], 'apps/web/components/catalog-image.tsx': ['6520bcfcd7738f465331b921a1138c4ea8259e48', '11a22651ace3b3bc7bd1917d2bdca557f2e0a126'], 'apps/web/components/launch-benefits.module.css': ['01b5e227fa337d32060cca89786cb756c53c7be7', '0c92060450464bd138f9d8df76e8a369364bc7c1'], 'apps/web/components/order-confirmation.module.css': ['8011d2a029806339062dcb29b1f5d8ceba8b72a1', 'a06039e5c01a8e547539372f29790890039348f4'], 'apps/web/components/product-card-media.module.css': ['87675806d054a1d2551c2b764615a4b76c490774', 'f8a9845b98cfc20d1229598b9ad0316448d7ad35'], 'apps/web/components/product-card.module.css': ['9e8c203082e195973773f263edfa02653f2886ad', 'a74ff65bc664175437276104e29843d24a0f407f'], 'apps/web/components/product-contact-actions.module.css': ['724a125459072ce37d23777db561c7c58b19efae', '7d6d9a829a5a4201d66a7be6feeba475f535825b'], 'apps/web/components/product-gallery.module.css': ['e4abad46539f9a784f83f1ac9e10d1ec94260988', 'bd0f6c27d8a916f74ac81c1a9f4a2b355e1075de'], 'apps/web/components/product-gallery.tsx': ['0be5a74b5b75554c3d82c1e6268a5bf5f5b5d2f3', '5a55c0ba290b4ffda92a89c30d192d6cb220018f'], 'apps/web/components/product-reviews.module.css': ['bef492b5fb90022731cb2369ad2304763691d18b', '9e1e023408b8b49ec67fff4e402fd1128fc38ccf'], 'apps/web/components/retention-preferences.module.css': ['2a304904b9836ef27112f291ddc5c951f630f905', '808e085def0fd37336d9eda1c30b4b58d6f4ae6e'], 'apps/web/components/return-exchange-request.module.css': ['6e7df66b3005be7cd5688c3a08199832a6ebdc98', 'b3146e1338300cff018291f213cae1e9ee8c4791'], 'apps/web/components/wallet.module.css': ['d42c87ab21a18ea64ab1ef7c3e2ce432891cddfb', '34e09c5dd0ba84c70fa18eb059d2e839848486c4']}

def blob(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()

def transform(path, text):
    if path.endswith(".module.css"):
        def background(match):
            value = match.group(2)
            value = re.sub(r"(?i)(?<![\w-])(?:#ffffff|#fff|white)(?![\w-])", "var(--hidi-page-bg, #fbf6f2)", value)
            value = re.sub(r"rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*(?:0?\.(?:7\d*|8\d*|9\d*)|1(?:\.0*)?)\s*\)", "var(--hidi-page-bg, #fbf6f2)", value)
            value = value.replace("#fcf9f9", "var(--hidi-page-bg, #fbf6f2)")
            return match.group(1) + value
        return re.sub(r"(\bbackground(?:-color)?\s*:\s*)([^;}]+)", background, text)
    if path.endswith("layout.tsx"):
        return text.replace('import "./typography.css";', 'import "./typography.css";\nimport "./storefront-surfaces.css";')
    if path.endswith("catalog-image.tsx"):
        return text.replace("linear-gradient(145deg, #ffffff, #fcf9f9)", "linear-gradient(145deg, var(--hidi-page-bg, #fbf6f2), var(--hidi-page-bg, #fbf6f2))")
    return re.sub(r'background: "(?:#ffffff|rgba\(255,255,255,\.(?:9|92)\))"', 'background: "var(--hidi-page-bg, #fbf6f2)"', text)

pending = {}
for name, (before, after) in EXPECTED.items():
    path = Path(name)
    data = path.read_bytes()
    if blob(data) == after:
        continue
    if blob(data) != before:
        raise SystemExit("Source changed; refusing to overwrite " + name)
    result = transform(name, data.decode("utf-8")).encode("utf-8")
    if blob(result) != after:
        raise SystemExit("Patch verification failed for " + name)
    pending[path] = result
for path, data in pending.items():
    path.write_bytes(data)
print("Verified and integrated", len(pending), "source files. No business logic or admin files changed.")
