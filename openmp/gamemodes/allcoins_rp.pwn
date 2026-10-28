#include <open.mp>

#define SERVER_NAME "ALLCOINS RP | Development"

main() {}

public OnGameModeInit()
{
    SetGameModeText("ALLCOINS RP | Alpha");
    ShowNameTags(true);
    ShowPlayerMarkers(PLAYER_MARKERS_MODE_GLOBAL);
    SetWorldTime(12);
    SetWeather(10);
    print("----------------------------------------");
    print(" ALLCOINS RP gamemode loaded");
    print(" AC wallet is not enabled in this build");
    print("----------------------------------------");
    return 1;
}

public OnPlayerConnect(playerid)
{
    SendClientMessage(playerid, 0xD7B65DFF, "Welcome to ALLCOINS RP Alpha!");
    SendClientMessage(playerid, 0xFFFFFFFF, "Telegram linking and AC wallet will be enabled after secure API integration.");
    return 1;
}

public OnPlayerCommandText(playerid, cmdtext[])
{
    if (!strcmp(cmdtext, "/help", true))
    {
        SendClientMessage(playerid, 0xD7B65DFF, "ALLCOINS RP commands: /help, /server");
        return 1;
    }
    if (!strcmp(cmdtext, "/server", true))
    {
        SendClientMessage(playerid, 0xD7B65DFF, SERVER_NAME);
        return 1;
    }
    return 0;
}
