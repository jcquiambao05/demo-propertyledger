FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
RUN npm ci --workspace web --include-workspace-root
COPY apps/web apps/web
RUN npm run build --workspace web
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["npm", "run", "start", "--workspace", "web"]
