# ---------- deps ----------
FROM oven/bun:latest AS deps
WORKDIR /temp/dev

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ---------- build ----------
FROM oven/bun:latest AS build
WORKDIR /usr/src/app

# потрібні dev deps (tailwind + bun-plugin-tailwind + tsx runtime)
COPY --from=deps /temp/dev/node_modules ./node_modules
COPY . .

# компілюємо сервер у бінар
RUN bun build --compile --target bun --outfile server src/index.ts

ENV KEYCRM_KEY=${KEYCRM_KEY}

EXPOSE 3000

ENTRYPOINT ["./server"]
