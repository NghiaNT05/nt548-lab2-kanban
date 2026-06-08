FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY server.js ./
COPY public ./public

# Chay bang user khong phai root (user "node" co san trong image)
USER node

EXPOSE 3000
CMD ["node", "server.js"]
