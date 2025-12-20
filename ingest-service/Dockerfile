FROM oven/bun:1.0-alpine
WORKDIR /app
COPY package.json .
RUN bun install
COPY index.ts .
EXPOSE 4000
CMD ["bun", "run", "index.ts"]
