FROM node:24-alpine
ARG BUILD_SHA=local
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY client ./client
COPY shared ./shared
COPY server ./server
RUN mkdir telemetry && chown -R node:node /app
USER node
ENV HOST=0.0.0.0
ENV PORT=3000
ENV NODE_ENV=production
ENV TELEMETRY_MODE=stdout
ENV BUILD_SHA=$BUILD_SHA
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
