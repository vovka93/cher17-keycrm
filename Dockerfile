FROM oven/bun:latest AS deps
WORKDIR /temp/dev

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:latest AS build
WORKDIR /usr/src/app

COPY --from=deps /temp/dev/node_modules ./node_modules
COPY . .

RUN bun run build

ENV KEYCRM_KEY=${KEYCRM_KEY}
ENV REDIS_URL=${REDIS_URL}

EXPOSE 3000

ENTRYPOINT ["./server"]
