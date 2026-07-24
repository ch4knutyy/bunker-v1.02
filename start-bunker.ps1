$project = 'C:\Users\lapte\Desktop\Bunker\bunker-git'

$command = @"
wt.exe -w new --maximized new-tab --title RUN --suppressApplicationTitle -d "$project" powershell.exe -NoExit -Command "dotnet watch run" ; split-pane -V -s 0.30 --title NGROK --suppressApplicationTitle -d "$project" powershell.exe -NoExit -Command "ngrok http 7283" ; new-tab --title AI --suppressApplicationTitle -d "$project" ; new-tab --title GIT --suppressApplicationTitle -d "$project" ; new-tab --title TEST --suppressApplicationTitle -d "$project" ; new-tab --title TOOLS --suppressApplicationTitle -d "$project"
"@

Start-Process cmd.exe -ArgumentList '/c', $command