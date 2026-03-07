FROM node:22-alpine AS build

WORKDIR /app

COPY package.json ./package.json
COPY tsconfig.json ./tsconfig.json
COPY server.ts ./server.ts

RUN npm install
RUN npm run build

FROM node:22-alpine

WORKDIR /app

COPY --from=build /app/dist/server.js ./server.js

EXPOSE 8080

CMD ["node", "server.js"]
