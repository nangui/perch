# Built from the repository root, because the demo is a workspace package and
# depends on the framework beside it rather than on a published version:
#
#     docker build -f examples/demo/Dockerfile -t perch-demo .
#
# The Perch representation is checked in, so only the Prisma client has to be
# generated here. That still wants a connection string, which Prisma reads
# before it decides it does not need one, so a placeholder is passed and the
# real one arrives at run time.
FROM node:22-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages ./packages
COPY examples/demo ./examples/demo
RUN pnpm install --frozen-lockfile

ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
RUN pnpm --filter @perchjs/example-demo generate \
  && pnpm --filter "@perchjs/*" build

FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo
COPY --from=build /repo /repo

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# `db push` rather than a migration: the demo owns its database and its schema
# is whatever this image was built from. An application with data somebody
# cares about uses migrations instead.
CMD ["sh", "-c", "pnpm --filter @perchjs/example-demo exec prisma db push --accept-data-loss && node examples/demo/dist/main.js"]
