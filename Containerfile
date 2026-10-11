# Node 24 LTS; immutable multi-platform digest verified on 2026-10-10.
FROM docker.io/library/node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN node -e "if(require('./package.json').packageManager !== 'npm@11.19.0') process.exit(1)" \
    && npm install --global npm@11.19.0 && npm ci

FROM dependencies AS build
COPY . .
RUN npm run build \
    && test -f apps/api/dist/server.js \
    && test -f apps/web/dist/index.html \
    && test -f db/migrations/meta/_journal.json

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev --ignore-scripts

FROM docker.io/library/node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS runtime
ARG VCS_REF
LABEL org.opencontainers.image.source="https://github.com/Menderin/Cenit" \
      org.opencontainers.image.revision=$VCS_REF
WORKDIR /app
COPY --from=production-dependencies --chown=1000:1000 /app/ /app/
COPY --from=build --chown=1000:1000 /app/apps/api/dist/ apps/api/dist/
COPY --from=build --chown=1000:1000 /app/apps/web/dist/ apps/web/dist/
COPY --from=build --chown=1000:1000 /app/packages/contracts/dist/ packages/contracts/dist/
COPY --from=build --chown=1000:1000 /app/db/migrations/ db/migrations/
COPY --from=build --chown=1000:1000 /app/deploy/migrate.cjs deploy/migrate.cjs
ENV NODE_ENV=production APP_ENV=demo HOST=0.0.0.0 PORT=3000
USER 1000:1000
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:3000/health/ready',{signal:AbortSignal.timeout(4000)}).then(async r=>process.exit(r.ok&&(await r.json()).status==='ready'?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/server.js"]
