FROM oven/bun:1.0-alpine
WORKDIR /app

# Copy package.json and install dependencies
COPY ingest-service/package.json ingest-service/
RUN cd ingest-service && bun install

# Copy shared proto and ingest-service source
COPY shared/ shared/
COPY ingest-service/ ingest-service/

WORKDIR /app/ingest-service

# Generate protobuf code during build
RUN bun x protoc --es_out=. --es_opt=target=ts --proto_path=../shared/proto ../shared/proto/audio.proto

EXPOSE 4000
CMD ["bun", "run", "index.ts"]
