# HIDI landing page Azure deployment

The original uploaded React ZIP is preserved byte-for-byte in `apps/web`.
This folder contains only Azure deployment tooling. The static server supports
MP4 byte ranges, HEAD requests, conditional requests, asset 404s, and suitable
caching for runtime settings and fingerprinted bundles.

Build from the repository root using the existing Azure account:

```bash
az acr build --registry acrhidiprod0927 \
  --image hidi-web:landing-<version> \
  --file deploy/hidi-web-new/Dockerfile .
az containerapp update --resource-group rg-hidi-prod --name hidi-web \
  --image acrhidiprod0927.azurecr.io/hidi-web:landing-<version>
```

The existing Container App listens on port 3000 and serves the configured
testing domain `https://thidigk.thehidi.com/`. Save the current image and revision
before updating so the previous deployment can be restored.

If ACR Tasks returns `TasksOperationsNotAllowed`, build and test `apps/web`
locally, package the generated `dist` directory with this folder's `server.mjs`
at the archive root, and use the daemon-free registry upload in Azure Cloud Shell:

```bash
az acr import --name acrhidiprod0927 --source docker.io/library/node:24-alpine \
  --image hidi-web:node24-base
python3 deploy/hidi-web-new/push-hidi-landing-oci.py \
  --registry acrhidiprod0927 --payload hidi-landing-runtime.tar.gz \
  --base hidi-web:node24-base --tag landing-<version>
```

The upload script reuses the current Azure login, keeps authentication tokens
in memory, retains the official Node base layers, and verifies the published
image configuration. It does not require Docker or ACR Tasks.

Validate the source before building:

```bash
cd apps/web
npm ci
npm test
npm run build
```

After deployment, compare the served files with the built output:

```bash
python3 deploy/hidi-web-new/smoke.py \
  --url https://thidigk.thehidi.com --dist apps/web/dist
```

The supplied ZIP contains design-preview flows. Account authentication,
live product catalogue, app-store URLs, policy links, social links, and
newsletter integrations retain the ZIP's settings. Deployment does not
connect these preview flows to the commerce backend.
