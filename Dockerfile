FROM node:18-alpine

# Crear directorio de trabajo
WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm install --production

# Copiar el resto del código
COPY . .

# Crear carpetas para volúmenes (persistencia)
RUN mkdir -p public/uploads data

# Exponer el puerto
EXPOSE 3000

# Comando de inicio
CMD ["npm", "start"]
