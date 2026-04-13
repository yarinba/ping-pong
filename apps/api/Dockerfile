FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter ./apps/api...
COPY packages/shared packages/shared
COPY apps/api apps/api
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["pnpm", "dev"]
