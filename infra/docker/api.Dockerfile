# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:24.18.0-bookworm-slim

FROM ${NODE_IMAGE} AS workspace

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}

WORKDIR /workspace

RUN apt-get update \
    && apt-get install --yes --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global pnpm@10.18.3

COPY --chown=node:node . .

RUN --mount=type=cache,id=rephone-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile


FROM workspace AS api-development

ENV NODE_ENV=development

USER node

EXPOSE 4000

CMD ["pnpm", "--filter", "@rephone/api", "dev"]


FROM workspace AS api-build

RUN pnpm --filter @rephone/api build


FROM api-build AS api-demo

ENV NODE_ENV=development
ENV API_PORT=4000

USER node

EXPOSE 4000

CMD ["node", "apps/api/dist/main.js"]


FROM ${NODE_IMAGE} AS api-production-dependencies

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}

WORKDIR /workspace

RUN npm install --global pnpm@10.18.3

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/api-client/package.json ./packages/api-client/package.json
COPY packages/eslint-config/package.json ./packages/eslint-config/package.json
COPY packages/test-config/package.json ./packages/test-config/package.json
COPY packages/typescript-config/package.json ./packages/typescript-config/package.json

RUN --mount=type=cache,id=rephone-pnpm,target=/pnpm/store \
    pnpm install --filter @rephone/api --prod --frozen-lockfile --ignore-scripts


FROM api-build AS api-operations

ENV NODE_ENV=production

USER node

CMD ["pnpm", "--filter", "@rephone/api", "db:check"]


FROM ${NODE_IMAGE} AS api-runtime

ENV NODE_ENV=production
ENV API_PORT=4000

WORKDIR /app

RUN apt-get update \
    && apt-get install --yes --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*

COPY --from=api-production-dependencies --chown=node:node /workspace/node_modules/ ./node_modules/
COPY --from=api-production-dependencies --chown=node:node /workspace/apps/api/node_modules/ ./apps/api/node_modules/
COPY --from=api-build --chown=node:node /workspace/apps/api/package.json ./apps/api/package.json
COPY --from=api-build --chown=node:node /workspace/apps/api/dist/ ./apps/api/dist/

USER node

EXPOSE 4000

ENTRYPOINT ["/usr/bin/tini", "--"]

HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=6 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4000/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "apps/api/dist/main.js"]
