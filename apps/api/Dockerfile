FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/sdk/package.json packages/sdk/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci

FROM deps AS builder
COPY apps/api apps/api
COPY packages/shared packages/shared

RUN npm --workspace packages/shared run build && npm --workspace apps/api run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/sdk/package.json packages/sdk/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/apps/api/dist apps/api/dist

EXPOSE 4000
CMD ["npm", "--workspace", "apps/api", "run", "start"]
