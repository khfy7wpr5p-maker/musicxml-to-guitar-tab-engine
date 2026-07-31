FROM node:24-bookworm-slim

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

WORKDIR /app

COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node schemas ./schemas

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
