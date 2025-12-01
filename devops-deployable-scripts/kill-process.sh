sudo lsof -t -i tcp:5000 | xargs -r sudo kill -9
kill -9 $(lsof -t -i:5000)
