# Eagle Property Ledger

```
cp .env.example .env
sed -i "s|^NEXTAUTH_SECRET=.*|NEXTAUTH_SECRET=$(openssl rand -hex 32)|; s|^MFA_ENCRYPTION_KEY=.*|MFA_ENCRYPTION_KEY=$(openssl rand -hex 32)|; s|^SEED_USER_PASSWORD=.*|SEED_USER_PASSWORD=$(openssl rand -hex 12)|" .env
ln -s ../../.env apps/web/.env
npm ci
docker compose up -d db redis
npm run migrate -w db
npm run seed -w db
npm run dev
```
