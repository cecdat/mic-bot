###############################################################################
# Stage 1: Builder (compile TypeScript)
###############################################################################
FROM docker.1ms.run/node:18-slim AS builder

WORKDIR /usr/src/microsoft-rewards-script

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN if [ -f package-lock.json ]; then \
      npm ci; \
    else \
      npm install; \
    fi

COPY . .

RUN npm run build

###############################################################################
# Stage 2: Runtime (Playwright image)
###############################################################################
FROM mcr.microsoft.com/playwright:v1.52.0-jammy

WORKDIR /usr/src/microsoft-rewards-script

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
         cron gettext-base tzdata python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY --from=builder /usr/src/microsoft-rewards-script/package*.json ./

RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev --ignore-scripts; \
    else \
      npm install --production --ignore-scripts; \
    fi

COPY --from=builder /usr/src/microsoft-rewards-script/dist ./dist

COPY get_all_hots.py .
COPY requirements.txt .

# [最终修正] 使用国内镜像源加速Python依赖安装
RUN pip3 install --no-cache-dir -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

COPY --chmod=755 src/run_daily.sh ./src/run_daily.sh
COPY --chmod=644 src/crontab.template /etc/cron.d/microsoft-rewards-cron.template
COPY --chmod=755 entrypoint.sh /usr/local/bin/entrypoint.sh

ENV TZ=UTC

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["sh", "-c", "echo 'Container started; cron is running.'"]
