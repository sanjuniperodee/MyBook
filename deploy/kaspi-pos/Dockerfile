# syntax=docker/dockerfile:1
# Шлюз Kaspi Pay для оплаты заказов: kaspi-pos-automation (MIT, github.com/tapter-dev/kaspi-pos-automation).
# Версия зафиксирована коммитом — обновляйте осознанно, проверив docs/API.md.
FROM node:22-bookworm-slim
ARG KASPI_POS_REF=175577ee1b34437dba46fb9bb0c8706f57f3b311
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN git clone https://github.com/tapter-dev/kaspi-pos-automation.git . \
  && git checkout "$KASPI_POS_REF" \
  && npm ci --omit=dev \
  && rm -rf .git
COPY entrypoint.sh /entrypoint.sh
ENV PORT=3000
VOLUME ["/data"]
EXPOSE 3000
ENTRYPOINT ["sh", "/entrypoint.sh"]
