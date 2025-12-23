sudo lsof -t -i tcp:5000 | xargs -r sudo kill -9
kill -9 $(lsof -t -i:5000)


# ---- .bashrc
lsof ~/.bashrc
kill 12345


# --- otra forma
ls -la ~ | grep swp
rm ~/.bashrc.swp


# ---- 
find ~/Documents \
  \( -path "/home/infi/Documents/projects/Escuela-Pohualizcalli/backstage-github-reactjs" -o -path "*/node_modules" -o "*/udacity-ai" \) -prune \
  -o -type f -name "*.py" -print 2>/dev/null


find /media/infi/322603e2-4ba6-4a53-9afd-6ee22141a5a1/home/michael \
  \( -path "*/Escuela-Pohualizcalli/backstage-github-reactjs" \
     -o -path "*/node_modules" -o -path "*/python3.12" -o -path "*/anaconda3" \
    -o -path "*/.venv" -o -path "*/.vscode"\) -prune \
  -o -type f -name "*.py" -print 2>/dev/null

.venv
.vscode


find /media/infi/322603e2-4ba6-4a53-9afd-6ee22141a5a1/home \
  \( -path "*/Escuela-Pohualizcalli/backstage-github-reactjs" \
     -o -path "*/.local"  -o -path "*/.cache"   \) -prune \
  -o -type f -name "*.py" -print 2>/dev/null

/media/infi/322603e2-4ba6-4a53-9afd-6ee22141a5a1/home/michael/Documents/AAA_Learning/python