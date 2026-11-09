@echo off
cd /d "%~dp0"
start "" http://127.0.0.1:5371/
python -m http.server 5371 --bind 127.0.0.1
