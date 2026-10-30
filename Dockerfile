# ---- Build Stage ----
FROM node:18-alpine AS builder
WORKDIR /app

# build‑args para las claves de Stripe y Supabase
ARG VITE_STRIPE_PUBLISHABLE_KEY
ARG VITE_STRIPE_SECRET_KEY
ARG VITE_SUPABASE_URL=https://xfqmknrtozlxoscotcqa.supabase.co
ARG VITE_SUPABASE_ANON_KEY=sb_publishable_2y7JVetNKfSr-0bBR19srg_Thlc65NA

# Convertir args en env para Vite
ENV VITE_STRIPE_PUBLISHABLE_KEY=$VITE_STRIPE_PUBLISHABLE_KEY
ENV VITE_STRIPE_SECRET_KEY=$VITE_STRIPE_SECRET_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY


COPY package*.json ./
RUN npm install --force

COPY . .
RUN npm run build

# ---- Production Stage ----
FROM nginx:stable-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
