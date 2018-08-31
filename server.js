//Mplayer + Wrapper anlegen
const createPlayer = require('mplayer-wrapper');
const player = createPlayer();

//WebSocketServer anlegen und starten
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080, clientTracking: true });

//Zeit Formattierung laden: [5, 13, 22] => 05:13:22
const timelite = require('timelite');

//Filesystem und Path Abfragen fuer Playlist
const path = require('path');
const fs = require('fs-extra');

//Array Shuffle Funktion
var shuffle = require('shuffle-array');

//Farbiges Logging
const colors = require('colors');

//Befehle auf Kommandzeile ausfuehren
const { execSync } = require('child_process');

//Verzeichnis, in dem die Audiodateien liegen (linxus vs. windows)
const audioDir = "/media/headless";
console.log("audio files are located in " + audioDir.yellow);

//Lautstaerke zu Beginn auf 100% setzen
let initialVolumeCommand = "sudo amixer sset PCM 100% -M";
console.log(initialVolumeCommand)
execSync(initialVolumeCommand);

//Aktuelle Infos zu Volume / Position in Song / Position innerhalb der Playlist / Playlist / PausedStatus / Random merken, damit Clients, die sich spaeter anmelden, diese Info bekommen
currentVolume = 50;
currentPosition = -1;
currentFiles = [];
currentActiveItem = "";
currentPlaylist = "";

//Player zu Beginn auf 50% stellen
player.setVolume(currentVolume);

//Wenn Playlist fertig ist
player.on('playlist-finish', () => {
    console.log("playlist finished");

    //Position zuruecksetzen
    currentPosition = -1;

    //Info in JSON schreiben, dass Playlist vorbei ist
    writeSessionJson();
});

//Wenn bei Track change der Filename geliefert wird
player.on('filename', (filename) => {

    //Position in Playlist ermitteln
    currentPosition = currentFiles.indexOf(currentPlaylist + "/" + filename);

    //neue Position in Session-JSON-File schreiben
    writeSessionJson();
});

//Wenn sich ein Titel aendert (durch Nutzer oder durch den Player)
player.on('track-change', () => {

    //Neuen Dateinamen liefern
    player.getProps(['filename']);
});

//Infos aus letzter Session auslesen, falls die Datei existiert
if (fs.existsSync('./lastSession.json')) {

    //JSON-Objekt aus Datei holen
    const lastSessionObj = fs.readJsonSync('./lastSession.json');

    //Playlist-Pfad laden
    currentPlaylist = lastSessionObj.path;
    console.log("load playlist from last session " + currentPlaylist);

    //Letztes aktives Item laden
    currentActiveItem = lastSessionObj.activeItem;

    //diese Playlist zu Beginn spielen
    setPlaylist(true);
}

//Wenn sich ein WebSocket mit dem WebSocketServer verbindet
wss.on('connection', function connection(ws) {
    console.log("new client connected");

    //Wenn WS eine Nachricht an WSS sendet
    ws.on('message', function incoming(message) {

        //Nachricht kommt als String -> in JSON Objekt konvertieren
        var obj = JSON.parse(message);

        //Werte auslesen
        let type = obj.type;
        let value = obj.value;

        //Array von MessageObjekte erstellen, die an WS gesendet werden
        let messageObjArr = [];

        //Pro Typ gewisse Aktionen durchfuehren
        switch (type) {

            //Song wurde vom Nutzer weitergeschaltet
            case 'change-item':
                console.log("change-item " + value);

                //wenn der naechste Song kommen soll
                if (value) {

                    //Wenn wir noch nicht beim letzten Titel sind
                    if (currentPosition < (currentFiles.length - 1)) {

                        //zum naechsten Titel springen
                        player.next();
                    }

                    //wir sind beim letzten Titel
                    else {
                        console.log("kein next beim letzten Track");
                    }
                }

                //der vorherige Titel soll kommen
                else {

                    //Wenn wir nicht beim 1. Titel sind
                    if (currentPosition > 0) {

                        //zum vorherigen Titel springen
                        player.previous();
                    }

                    //wir sind beim 1. Titel
                    else {
                        console.log("1. Titel von vorne");

                        //Playlist nochmal von vorne starten
                        player.seekPercent(0);
                    }
                }
                break;

            //Innerhalb des Titels spulen
            case "seek":

                //+/- 10 Sek
                let seekTo = value ? 10 : -10;

                //seek in item
                player.seek(seekTo);
                break;

            //Pause-Status toggeln
            case 'toggle-paused-restart':

                //Wenn wir gerade in der Playlist sind
                if (currentPosition !== -1) {

                    //Pause toggeln
                    player.playPause();
                }

                //Playlist ist schon vorbei
                else {

                    //wieder von vorne beginnen
                    currentPosition = 0;

                    //Playlist-Datei laden und starten
                    player.exec("loadlist playlist.txt");
                }
                break;

            //Lautstaerke aendern
            case 'change-volume':

                //Wenn es lauter werden soll, max. 100 setzen
                if (value) {
                    currentVolume = Math.min(100, currentVolume + 10);
                }

                //es soll leiser werden, min. 0 setzen
                else {
                    currentVolume = Math.max(0, currentVolume - 10);
                }

                //Lautstaerke setzen
                console.log("change volume to " + currentVolume);
                player.setVolume(currentVolume);
                break;

            //System herunterfahren
            case "shutdown":
                console.log("shutdown");

                //Pi herunterfahren
                execSync("shutdown -h now");
                break;
        }
    });
});

//Playlist erstellen und starten
function setPlaylist(reloadSession) {

    //Sicherstellen, dass Verzeichnis existiert, aus dem die Dateien geladen werden sollen
    if (fs.existsSync(currentPlaylist)) {

        //Liste der files zuruecksetzen
        currentFiles = [];

        //Ueber Dateien in aktuellem Verzeichnis gehen
        fs.readdirSync(currentPlaylist).forEach(file => {

            //mp3 (audio) files sammeln
            if ([".mp3"].includes(path.extname(file).toLowerCase())) {
                console.log("add file " + file);
                currentFiles.push(currentPlaylist + "/" + file);
            }
        });

        //Bei Random und erlaubtem Random
        if (currentRandom && currentAllowRandom) {

            //FileArray shuffeln
            shuffle(currentFiles);
        }

        //Playlist-Datei schreiben (1 Zeile pro item)
        fs.writeFileSync("playlist.txt", currentFiles.join("\n"));

        //Playlist-Datei laden und starten
        player.exec("loadlist playlist.txt");

        //Wenn die Daten aus einer alten Session kommen
        if (reloadSession) {

            //zu gewissem Titel springen, wenn nicht sowieso der erste Titel
            if (currentPosition > 0) {
                player.exec("pt_step " + currentPosition);
            }
        }
    }

    //Verzeichnis existiert nicht
    else {
        console.log("dir doesn't exist " + currentPlaylist.red);
    }
}

//Infos der Session in File schreiben
function writeSessionJson() {

    //Playlist zusammen mit anderen Merkmalen merken fuer den Neustart
    fs.writeJsonSync('./lastSession.json',
        {
            path: currentPlaylist,
            activeItem: currentActiveItem,
            allowRandom: currentAllowRandom,
            position: currentPosition
        });
}