@echo off
echo Deploying to GitHub...
echo.

:: Add all changes
git add .

:: Ask for commit message
set /p msg="Enter commit message (pushed): "
if "%msg%"=="" set msg="Update: Implemented Admin Help, Intelligent Chatbot, Mobile UI, Notifications, and Cancel features"

:: Commit and Push
git commit -m "%msg%"
git push

echo.
echo Deployment complete!
pause
