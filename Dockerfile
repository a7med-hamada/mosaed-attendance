FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

# Permissions for Hugging Face Spaces non-root container
RUN chmod -R 777 /app

EXPOSE 7860
ENV PORT=7860
ENV NODE_ENV=production
ENV NODE_OPTIONS="--experimental-sqlite"

CMD ["node", "--experimental-sqlite", "server/app.js"]
