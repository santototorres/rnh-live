FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

COPY . .

RUN npx prisma generate
RUN npx tsc

EXPOSE 3001

CMD ["node", "dist/index.js"]
