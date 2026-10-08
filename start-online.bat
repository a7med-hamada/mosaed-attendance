@echo off
title Workforce Attendance System - Online Server
chcp 65001 > nul
echo ========================================================
echo   منظومة إدارة حضور وانصراف قوى العمل (Online Tunnel)
echo ========================================================
echo.
echo [1/2] جاري تشغيل خادم المنظومة...
start /b "Workforce Server" "C:\Program Files\nodejs\node.exe" server/app.js
timeout /t 2 > nul
echo.
echo [2/2] جاري تشغيل الرابط العام عبر Cloudflare...
echo.
echo الرابط سيكون متاحاً لأي جهاز (هواتف، أجهزة لوحية، كمبيوتر) مع دعم الكاميرا والـ GPS بالكامل.
echo.
.\cloudflared.exe tunnel --url http://localhost:3000
pause
