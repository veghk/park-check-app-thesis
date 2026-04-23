# Build stage: compile React PWA into static files
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json .
RUN npm install

COPY . .
RUN mkdir -p public/ort && cp -r node_modules/onnxruntime-web/dist/. public/ort/
RUN npm run build

# Production stage: serve built files with Nginx
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
