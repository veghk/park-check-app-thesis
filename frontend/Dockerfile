FROM node:20-alpine

WORKDIR /app

COPY package.json .
RUN npm install

COPY . .

EXPOSE 5173

CMD ["sh", "-c", "mkdir -p public/ort && cp -r node_modules/onnxruntime-web/dist/. public/ort/ && npm run dev"]
