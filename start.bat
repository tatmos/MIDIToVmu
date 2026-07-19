@echo off
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js が見つかりません。https://nodejs.org/ からインストールしてください。
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo 依存パッケージをインストールしています...
  call npm install
  if errorlevel 1 (
    echo npm install に失敗しました。
    pause
    exit /b 1
  )
)

echo.
echo MIDIToVMU を起動します...
echo ブラウザで http://localhost:5173/ を開いてください。
echo 終了するにはこのウィンドウで Ctrl+C を押してください。
echo.

start "" "http://localhost:5173/"
call npm run dev

pause
