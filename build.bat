@echo off
echo Building BrowserNametag.exe...
"C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /target:winexe /win32icon:icons\app.ico /optimize+ /out:BrowserNametag.exe src\Program.cs /r:System.Windows.Forms.dll /r:System.Drawing.dll
if %errorlevel% equ 0 (
    echo [OK] BrowserNametag.exe successfully built!
) else (
    echo [ERROR] Compilation failed!
)
pause
