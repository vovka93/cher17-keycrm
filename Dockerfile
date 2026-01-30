FROM oven/bun:latest AS deps
WORKDIR /temp/dev

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:latest AS build
WORKDIR /usr/src/app

COPY --from=deps /temp/dev/node_modules ./node_modules
COPY . .

RUN bun build --compile --target bun --outfile server src/index.ts

ENV KEYCRM_KEY=${KEYCRM_KEY}
ENV REDIS_URL=${REDIS_URL}

EXPOSE 3000

ENTRYPOINT ["./server"]
