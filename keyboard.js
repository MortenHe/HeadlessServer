//Mit WebsocketServer verbinden
console.log("connect to WS Server");
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:8080');

//Input von Kommandozeile lesen
var stdin = process.stdin;
stdin.setRawMode(true);
stdin.resume();
stdin.setEncoding('utf8');

//Wenn Verbindung mit WSS hergestellt wird
ws.on('open', function open() {
    console.log("connected to wss");

    // on any data into stdin
    stdin.on('data', function (key) {

        //verschiedene Aktionen ausfuehren
        switch (key) {
            case "q":
                process.exit();
                break;

            //next playlist
            case "e":
                send("change-playlist", 1);
                break;

            //previous playlist
            case "w":
                send("change-playlist", -1);
                break;

            //next track
            case "s":
                send("change-track", true);
                break;

            //previous track
            case "a":
                send("change-track", false);
                break;

            //seek +
            case "x":
                send("seek", 10);
                break;

            //seek -
            case "y":
                send("seek", -10);
                break;

            //seek -
            case "p":
                send("toggle-paused-restart", "");
                break;

            //reset countdown
            case "r":
                send("reset-countdown", "");
                break;
        }
    });
});

//Info an WSS schicken
function send(type, value) {
    console.log(type + ": " + value);
    ws.send(JSON.stringify({
        type: type,
        value: value
    }));
}