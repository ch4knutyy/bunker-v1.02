$project = 'C:\Users\lapte\Desktop\Bunker\bunker-git'

$command = @"
wt.exe -w 0 new-tab --title RUN --suppressApplicationTitle -d "$project" powershell.exe -NoExit -Command "dotnet watch run" ; split-pane -V -s 0.30 --title NGROK --suppressApplicationTitle -d "$project" powershell.exe -NoExit -Command "ngrok http https://localhost:7283 --host-header=rewrite" ; move-focus left
"@

Start-Process cmd.exe `
    -ArgumentList '/c', $command `
    -WindowStyle Hidden