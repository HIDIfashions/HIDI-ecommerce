ARG STOREFRONT_IMAGE=acrhidiprod0927.azurecr.io/hidi-web@sha256:1bc1614ac79ea6718f94a67d3a2f5525af3a3b228dcf46191c15b75069184a31
FROM node:24-alpine AS build
WORKDIR /app
COPY apps/web/package*.json ./
RUN npm ci
COPY apps/web/ ./
RUN npm run build

FROM ${STOREFRONT_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node deploy/hidi-web-new/server.mjs ./server.mjs
EXPOSE 3000
CMD ["node", "server.mjs"]
