# Obraz produkcyjny aplikacji "Gdzie Niemiec".
FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=8080 \
    # Na publicznej stronie nie chcemy podsuwać zwiedzającym symulowanych
    # tramwajów - przy awarii feedu ZTM lepiej pokazać pustą mapę i błąd.
    DEMO_FALLBACK=0

WORKDIR /app

# Najpierw manifesty - warstwa z zależnościami cache'uje się między buildami.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY public ./public

USER node
EXPOSE 8080

# Kontener jest zdrowy, gdy serwer odpowiada na /api/health.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
