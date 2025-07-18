#!/usr/bin/env bash
set -euo pipefail

export PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

: "${TZ:=UTC}"
ln -snf "/usr/share/zoneinfo/$TZ" /etc/localtime
echo "$TZ" > /etc/timezone
dpkg-reconfigure -f noninteractive tzdata

if [ -z "${CRON_SCHEDULE:-}" ]; then
  echo "ERROR: CRON_SCHEDULE environment variable is not set." >&2
  echo "Please set CRON_SCHEDULE (e.g., \"0 2 * * *\")." >&2
  exit 1
fi

# [核心修改] 在容器启动时，立即运行一次Python脚本以生成初始的搜索词文件
echo "[entrypoint] Running Python script to fetch initial hot searches at $(date)"
if python3 /usr/src/microsoft-rewards-script/get_all_hots.py; then
  echo "[entrypoint] Initial hot searches fetched successfully."
else
  echo "[entrypoint] ERROR: Failed to fetch initial hot searches!" >&2
fi
# [核心修改结束]

if [ "${RUN_ON_START:-false}" = "true" ]; then
  echo "[entrypoint] Starting initial run of Node.js script in background at $(date)"
  (
    cd /usr/src/microsoft-rewards-script || {
      echo "[entrypoint-bg] ERROR: Unable to cd to /usr/src/microsoft-rewards-script" >&2
      exit 1
    }
    SKIP_RANDOM_SLEEP=true src/run_daily.sh
    echo "[entrypoint-bg] Initial run completed at $(date)"
  ) &
  echo "[entrypoint] Background process started (PID: $!)"
fi

if [ ! -f /etc/cron.d/microsoft-rewards-cron.template ]; then
  echo "ERROR: Cron template /etc/cron.d/microsoft-rewards-cron.template not found." >&2
  exit 1
fi

export TZ
envsubst < /etc/cron.d/microsoft-rewards-cron.template > /etc/cron.d/microsoft-rewards-cron
chmod 0644 /etc/cron.d/microsoft-rewards-cron
crontab /etc/cron.d/microsoft-rewards-cron

echo "[entrypoint] Cron configured with schedule: $CRON_SCHEDULE and timezone: $TZ; starting cron at $(date)"

exec cron -f
