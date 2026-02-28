FROM node:20-alpine

WORKDIR /app

COPY package.json .
RUN npm install

COPY . .

RUN mkdir -p public/ort && cp -r node_modules/onnxruntime-web/dist/. public/ort/

EXPOSE 5173

CMD ["npm", "run", "dev"]
