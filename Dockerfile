FROM node:20-bookworm-slim

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3 \
        python3-pip \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./

RUN npm install --no-audit --no-fund

COPY prisma ./prisma

RUN npx prisma generate

COPY analysis/requirements.txt ./analysis/requirements.txt

RUN pip3 install \
    --no-cache-dir \
    --break-system-packages \
    -r analysis/requirements.txt

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["sh", "-c", "npx prisma db push && npx tsx prisma/seed.ts && npm run start -- -p ${PORT:-3000}"]
