FROM node:22-slim
WORKDIR /app
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./
COPY apps/worker/package.json apps/worker/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter ./apps/worker...
COPY packages/shared packages/shared
COPY apps/worker apps/worker
WORKDIR /app/apps/worker
CMD ["pnpm", "dev"]
