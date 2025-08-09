# Stage 1: Builder (compile TypeScript)
FROM docker.1ms.run/node:18-slim AS builder

WORKDIR /app

COPY package*.json ./
# Use npm ci for faster, more reliable builds if package-lock.json exists
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .
RUN npm run build

# Stage 2: Production Runtime
FROM mcr.microsoft.com/playwright:v1.52.0-jammy

WORKDIR /app

# Install Python and pip, which are needed for the hot search script
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Copy only necessary production dependencies from the builder stage
COPY --from=builder /app/package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# Copy compiled app and python script from the builder stage
COPY --from=builder /app/dist ./dist
COPY get_all_hots.py .
COPY requirements.txt .

# Install Python dependencies
RUN pip3 install --no-cache-dir -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# The command that will be run when the container starts
CMD ["node", "dist/index.js"]