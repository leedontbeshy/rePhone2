# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:24.18.0-bookworm-slim

FROM ${NODE_IMAGE} AS workspace

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}

WORKDIR /workspace

RUN apt-get update \
    && apt-get install --yes --no-install-recommends openssl git \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global pnpm@10.18.3

COPY --chown=node:node . .

RUN --mount=type=cache,id=rephone-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile \
    && chown node:node /workspace \
    && chown -R node:node apps/api/src/generated packages/api-client/dist


FROM workspace AS web-development

ENV NODE_ENV=development
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

USER node

EXPOSE 3000

CMD ["pnpm", "--filter", "@rephone/web", "dev"]


FROM workspace AS web-build

ARG NEXT_PUBLIC_API_BASE_URL=/api/v1
ARG API_PUBLIC_URL
ARG DEALER_ENVIRONMENT=LIVE
ARG NEXT_PUBLIC_STORE_EMAIL=hello@rephone.vn
ARG NEXT_PUBLIC_SOCIAL_FACEBOOK_URL=https://www.facebook.com/rephone.vn
ARG NEXT_PUBLIC_SOCIAL_INSTAGRAM_URL=https://www.instagram.com/rephone.vn
ARG NEXT_PUBLIC_SOCIAL_TIKTOK_URL=https://www.tiktok.com/@rephone.vn

ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
ENV API_PUBLIC_URL=${API_PUBLIC_URL}
ENV DEALER_ENVIRONMENT=${DEALER_ENVIRONMENT}
ENV NEXT_PUBLIC_STORE_EMAIL=${NEXT_PUBLIC_STORE_EMAIL}
ENV NEXT_PUBLIC_SOCIAL_FACEBOOK_URL=${NEXT_PUBLIC_SOCIAL_FACEBOOK_URL}
ENV NEXT_PUBLIC_SOCIAL_INSTAGRAM_URL=${NEXT_PUBLIC_SOCIAL_INSTAGRAM_URL}
ENV NEXT_PUBLIC_SOCIAL_TIKTOK_URL=${NEXT_PUBLIC_SOCIAL_TIKTOK_URL}

RUN mkdir -p apps/web/public \
    && pnpm --filter @rephone/web build


FROM ${NODE_IMAGE} AS web-runtime

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

WORKDIR /app

RUN apt-get update \
    && apt-get install --yes --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*

COPY --from=web-build --chown=node:node /workspace/apps/web/.next/standalone/ ./
COPY --from=web-build --chown=node:node /workspace/apps/web/.next/static/ ./apps/web/.next/static/
COPY --from=web-build --chown=node:node /workspace/apps/web/public/ ./apps/web/public/

USER node

EXPOSE 3000

ENTRYPOINT ["/usr/bin/tini", "--"]

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=6 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(r.status!==204)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "apps/web/server.js"]
