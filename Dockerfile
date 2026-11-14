FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY public ./public
COPY data/zones.json ./data/zones.json
COPY scripts/seed.mjs ./scripts/seed.mjs
# Run as an unprivileged user; database and photos live in a volume.
RUN mkdir -p /app/var && chown -R node:node /app/var
USER node
VOLUME ["/app/var"]
EXPOSE 3000
HEALTHCHECK CMD wget -qO- http://127.0.0.1:3000/api/stats > /dev/null || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
