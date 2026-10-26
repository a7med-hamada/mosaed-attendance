FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

RUN addgroup -S workforce && adduser -S workforce -G workforce
COPY --chown=workforce:workforce . .

RUN mkdir -p /app/data /app/data/uploads && chown -R workforce:workforce /app
USER workforce

EXPOSE 7860
ENV PORT=7860
ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/attendance.db
ENV UPLOADS_DIR=/app/data/uploads
ENV NODE_OPTIONS="--experimental-sqlite"

CMD ["node", "--experimental-sqlite", "server/app.js"]
