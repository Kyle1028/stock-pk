@echo off
rem 本機每日更新：抓最新資料 -> 有變動才提交 -> 推上 GitHub（網站約 1~2 分鐘後更新）
rem 由 Windows 工作排程器每天執行；也可以直接雙擊手動執行。執行紀錄寫在 update.log。
chcp 65001 >nul
cd /d "%~dp0.."
set GIT="C:\Program Files\Git\cmd\git.exe"
if not exist %GIT% set GIT="%LOCALAPPDATA%\Programs\Git\cmd\git.exe"
set NODE="C:\Program Files\nodejs\node.exe"
set LOG=update.log

echo ===== %date% %time% ===== >> %LOG%
%GIT% pull --rebase origin main >> %LOG% 2>&1
if errorlevel 1 (echo [錯誤] git pull 失敗 >> %LOG% & exit /b 1)

%NODE% scripts\fetch_all.js >> %LOG% 2>&1
if errorlevel 1 (echo [錯誤] 抓資料失敗，保留原本資料 >> %LOG% & exit /b 1)

%GIT% add data/snapshot.json
%GIT% diff --cached --quiet
if not errorlevel 1 (echo 資料沒有變動 >> %LOG% & exit /b 0)

%GIT% -c user.name="Kyle1028" -c user.email="93895301+Kyle1028@users.noreply.github.com" commit -q -m "更新財務資料 %date%" >> %LOG% 2>&1
%GIT% push origin main >> %LOG% 2>&1
if errorlevel 1 (echo [錯誤] git push 失敗 >> %LOG% & exit /b 1)
echo 完成 >> %LOG%
