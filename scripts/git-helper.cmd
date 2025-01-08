@echo off
set GIT_PATH=C:\Program Files\Git\bin
set PATH=%GIT_PATH%;%PATH%

IF "%1"=="add" (
    git add .
) ELSE IF "%1"=="commit" (
    git commit -m "%2"
) ELSE IF "%1"=="push" (
    git push -u origin main
)
