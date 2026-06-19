git pull

# Rebuild (uses cached node_modules layer if package.json unchanged)
sudo docker build -t dms-server .

# Restart
sudo docker stop dms-server && sudo docker rm dms-server
sudo docker run -d \
  --name dms-server \
  --env-file .env \
  -p 5555:5555 \
  -v /home/avail/data/dms-server-data:/app/var \
  --restart unless-stopped \
  dms-server
