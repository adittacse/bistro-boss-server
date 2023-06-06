# Use the official Node.js image as the base image
FROM node:18
# PJnGxnh1nCjWCk7z
# Set the working directory in the container
WORKDIR /app

# Copy the application files into the working directory
COPY package.json .

# Install the application dependencies
RUN npm install

COPY . .

EXPOSE 3000

# Define the entry point for the container
CMD ["node", "index.js"]

