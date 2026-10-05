# HIDI landing page and existing Azure storefront

The supplied React landing design is in `apps/web`. Its account, collection,
search, cart, support, and newsletter controls use the existing same-origin
storefront routes. The original unmodified ZIP remains at commit
`c3f3a33ed3d860ee129de9a6144215fc554876e8`.

The runtime keeps the existing Azure Next.js storefront image and appends the
landing build. `server.mjs` serves `/` and landing assets on port 3000 and starts
Next.js on loopback port 3001. Other routes, including `/api/store`, `/_next`,
product media, account, and admin, stream through to that storefront. Backend
identity, API connectivity, cookies, and authentication remain in that image
and the existing Container App environment.

Validate and build from the repository root:

```bash
cd apps/web
npm ci
npm test
npm run build
cd ../..
node --test deploy/hidi-web-new/runtime.test.mjs
```

For a Docker-capable builder, use `deploy/hidi-web-new/Dockerfile` from the
repository root. `STOREFRONT_IMAGE` selects the existing tested Azure storefront
image; use its immutable digest for deployment.

ACR Tasks are unavailable on the current subscription. Package the tested
`apps/web/dist` and this folder's `server.mjs` at the archive root, then upload
the archive and `push-hidi-landing-oci.py` to the existing Azure Cloud Shell:

```bash
python3 push-hidi-landing-oci.py \
  --registry acrhidiprod0927 --payload hidi-landing-connected-runtime.tar.gz \
  --base hidi-web@sha256:1bc1614ac79ea6718f94a67d3a2f5525af3a3b228dcf46191c15b75069184a31 \
  --tag landing-connected-<version>
az containerapp update --resource-group rg-hidi-prod --name hidi-web \
  --image acrhidiprod0927.azurecr.io/hidi-web@sha256:<published-digest> \
  --revision-suffix <unique-version>
```

The upload script reuses the current Azure login, keeps tokens in memory,
retains the existing storefront layers and non-root user, and verifies the
published image configuration. It requires neither Docker nor ACR Tasks.

Run live verification:

```bash
python3 deploy/hidi-web-new/smoke.py \
  --url https://thidigk.thehidi.com --dist apps/web/dist
python3 deploy/hidi-web-new/wiring-smoke.py \
  --url https://thidigk.thehidi.com
```

The backend currently uses Firebase customer OTP and `hidi-sql-validation`,
with `MIGRATION_READ_ONLY=true` and customer testing enabled. Newsletter and
checkout/payment writes remain restricted by that backend configuration.
Connecting a button does not change those restrictions. Privacy/terms pages,
app-store destinations, and social links are unavailable until verified URLs
or approved content are supplied.

Hero media uploads are served by the landing runtime at `/admin/hero-media`.
Proxied `/admin` HTML pages also receive a direct **Hero Media** entry so the
control page is discoverable from the existing admin portal.
For Azure Blob, set the Container App environment to:

```bash
MEDIA_STORAGE_PROVIDER=azure
AZURE_STORAGE_ACCOUNT=sthidiprod0927
AZURE_STORAGE_CONTAINER=<hero media container>
MEDIA_PUBLIC_BASE_URL=/api/hidi/hero-asset
AZURE_CLIENT_ID=<hidi-web managed identity client id>
```

The managed identity needs Blob data read/write access on the storage account
or container. Uploaded hero assets are streamed back through the landing
runtime at `/api/hidi/hero-asset/brand/hero/media/...`, so the storage account
can keep public network and anonymous blob access disabled.
`AZURE_STORAGE_CONTAINER` can also be supplied as `MEDIA_STORAGE_CONTAINER`,
`AZURE_BLOB_CONTAINER` or `BLOB_CONTAINER`.
R2 remains supported only when `MEDIA_STORAGE_PROVIDER=r2` and the existing R2
credentials are present.
